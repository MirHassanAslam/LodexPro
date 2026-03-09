package downloader

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"LodexPro/backend/models"
)

type RateLimiter struct {
	mu          sync.Mutex
	bytesPerSec int64
	tokens      int64
	lastUpdated time.Time
}

func NewRateLimiter(bytesPerSec int64) *RateLimiter {
	return &RateLimiter{
		bytesPerSec: bytesPerSec,
		tokens:      bytesPerSec,
		lastUpdated: time.Now(),
	}
}

func (rl *RateLimiter) SetLimit(bytesPerSec int64) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	rl.bytesPerSec = bytesPerSec
	if rl.tokens > bytesPerSec {
		rl.tokens = bytesPerSec
	}
}

func (rl *RateLimiter) Wait(n int) {
	for {
		rl.mu.Lock()
		if rl.bytesPerSec <= 0 {
			rl.mu.Unlock()
			return
		}

		now := time.Now()
		elapsed := now.Sub(rl.lastUpdated).Seconds()
		rl.lastUpdated = now

		rl.tokens += int64(elapsed * float64(rl.bytesPerSec))
		if rl.tokens > rl.bytesPerSec {
			rl.tokens = rl.bytesPerSec
		}

		if rl.tokens >= int64(n) {
			rl.tokens -= int64(n)
			rl.mu.Unlock()
			return
		}

		needed := int64(n) - rl.tokens
		sleepTime := time.Duration(float64(needed) / float64(rl.bytesPerSec) * float64(time.Second))
		rl.mu.Unlock()

		time.Sleep(sleepTime)
	}
}

type Engine struct {
	client           *http.Client
	ProgressCallback func(*models.DownloadTask)
	limiter          *RateLimiter
}

func NewEngine(pc func(*models.DownloadTask)) *Engine {
	return &Engine{
		client: &http.Client{
			Transport: &http.Transport{
				MaxIdleConns:        100,
				IdleConnTimeout:     90 * time.Second,
				MaxIdleConnsPerHost: 20,
			},
		},
		ProgressCallback: pc,
		limiter:          NewRateLimiter(0), // 0 means unlimited
	}
}

func (e *Engine) SetGlobalSpeedLimit(bytesPerSec int64) {
	e.limiter.SetLimit(bytesPerSec)
}

func (e *Engine) FetchMetadata(url string) (*models.DownloadTask, error) {
	req, err := http.NewRequest("HEAD", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := e.client.Do(req)
	if err != nil {
		// Fallback to GET if HEAD refers to an error
		resp, err = e.client.Get(url)
		if err != nil {
			return nil, err
		}
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("server returned error: %d", resp.StatusCode)
	}

	task := &models.DownloadTask{
		URL:       url,
		TotalSize: resp.ContentLength,
		Status:    models.StatusQueued,
	}

	// Extract filename from Content-Disposition
	if cd := resp.Header.Get("Content-Disposition"); cd != "" {
		_, params, err := mime.ParseMediaType(cd)
		if err == nil {
			if filename, ok := params["filename"]; ok {
				task.Filename = filename
			}
		}
	}

	// Fallback to URL path
	if task.Filename == "" {
		parts := strings.Split(url, "/")
		task.Filename = parts[len(parts)-1]
		if idx := strings.Index(task.Filename, "?"); idx != -1 {
			task.Filename = task.Filename[:idx]
		}
	}

	// Default if still empty
	if task.Filename == "" {
		task.Filename = "download"
	}

	return task, nil
}

func (e *Engine) Download(ctx context.Context, task *models.DownloadTask) error {
	if task.TotalSize <= 0 {
		return fmt.Errorf("invalid file size")
	}

	// Calculate segments if not already present (new download)
	if len(task.Segments) == 0 {
		numSegments := 8
		if task.TotalSize > 50*1024*1024 { // > 50MB
			numSegments = 16
		}
		segmentSize := task.TotalSize / int64(numSegments)
		task.Segments = make([]models.Segment, numSegments)

		for i := 0; i < numSegments; i++ {
			start := (int64(i) * segmentSize)
			end := start + segmentSize - 1
			if i == numSegments-1 {
				end = task.TotalSize - 1
			}
			task.Segments[i] = models.Segment{
				ID:        i,
				StartByte: start,
				EndByte:   end,
			}
		}
	}

	// Open file in read-write mode, create if not exists
	file, err := os.OpenFile(task.SavePath, os.O_RDWR|os.O_CREATE, 0644)
	if err != nil {
		return err
	}
	defer file.Close()

	// Ensure file size is allocated (prevents fragmentation and ensures space)
	if _, err := file.Seek(task.TotalSize-1, 0); err == nil {
		file.Write([]byte{0})
	}

	var wg sync.WaitGroup
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	task.Status = models.StatusDownloading

	// Progress ticker
	done := make(chan bool)
	go func() {
		ticker := time.NewTicker(1000 * time.Millisecond)
		defer ticker.Stop()
		lastSize := atomic.LoadInt64(&task.DownloadedSize)

		for {
			select {
			case <-ticker.C:
				currentSize := atomic.LoadInt64(&task.DownloadedSize)
				task.Speed = float64(currentSize - lastSize)
				lastSize = currentSize

				if task.Speed > 0 {
					remainingBytes := task.TotalSize - currentSize
					task.ETA = int64(float64(remainingBytes) / task.Speed)
				}

				if e.ProgressCallback != nil {
					e.ProgressCallback(task)
				}
			case <-done:
				return
			}
		}
	}()

	for i := range task.Segments {
		if task.Segments[i].Completed {
			continue
		}
		wg.Add(1)
		go e.downloadSegmentWithRetries(ctx, task, &task.Segments[i], &wg, file)
	}

	wg.Wait()
	close(done)

	// If context was cancelled (e.g., paused), return the error instead of completing
	if ctx.Err() != nil {
		return ctx.Err()
	}

	if task.Status != models.StatusError && task.Status != models.StatusPaused {
		task.Status = models.StatusCompleted
	}
	
	if e.ProgressCallback != nil {
		e.ProgressCallback(task)
	}

	return nil
}

func (e *Engine) downloadSegmentWithRetries(ctx context.Context, task *models.DownloadTask, seg *models.Segment, wg *sync.WaitGroup, file *os.File) {
	defer wg.Done()

	maxRetries := 5
	retryDelay := 2 * time.Second

	for i := 0; i < maxRetries; i++ {
		err := e.downloadSegment(ctx, task, seg, file)
		if err == nil || errors.Is(err, context.Canceled) {
			return
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(retryDelay):
			retryDelay *= 2 // Exponential backoff
		}
	}

	task.Status = models.StatusError
}

func (e *Engine) downloadSegment(ctx context.Context, task *models.DownloadTask, seg *models.Segment, file *os.File) error {
	req, err := http.NewRequestWithContext(ctx, "GET", task.URL, nil)
	if err != nil {
		return err
	}

	rangeHeader := fmt.Sprintf("bytes=%d-%d", seg.StartByte+seg.DownloadedSize, seg.EndByte)
	req.Header.Set("Range", rangeHeader)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusPartialContent && resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	// Create a buffer for reading and writing
	buffer := make([]byte, 64*1024)
	for {
		select {
		case <-ctx.Done():
			return context.Canceled
		default:
			n, err := resp.Body.Read(buffer)
			if n > 0 {
				if e.limiter != nil {
					e.limiter.Wait(n)
				}
				// Thread-safe writing at specific offset
				_, writeErr := file.WriteAt(buffer[:n], seg.StartByte+seg.DownloadedSize)
				if writeErr != nil {
					return writeErr
				}
				seg.DownloadedSize += int64(n)
				atomic.AddInt64(&task.DownloadedSize, int64(n))
			}
			if err == io.EOF {
				seg.Completed = true
				return nil
			}
			if err != nil {
				return err
			}
		}
	}
}
