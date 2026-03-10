package main

import (
	"LodexPro/backend/downloader"
	"LodexPro/backend/models"
	"LodexPro/backend/services"
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
// AppVersion is set at build time via: -ldflags "-X main.AppVersion=v2.1.0"
var AppVersion = "v2.0.0"

type App struct {
	ctx       context.Context
	engine    *downloader.Engine
	storage   *services.Storage
	config    *services.ConfigService
	media     *services.MediaService
	ytdlp     *services.YTService
	antivirus *services.AntivirusService
	cancels   map[string]context.CancelFunc
	cancelMu  sync.Mutex
	queueMu   sync.Mutex
	maxActive int
	mediaMu   sync.Mutex
	mediaList []models.MediaItem
}

// NewApp creates a new App application struct
func NewApp() *App {
	exePath, _ := os.Executable()
	baseDir := filepath.Dir(exePath)
	dbPath := filepath.Join(baseDir, "lodify.db")
	storage, err := services.NewStorage(dbPath)
	if err != nil {
		log.Printf("Failed to initialize storage: %v", err)
	}

	cfg := services.NewConfigService(baseDir)

	app := &App{
		storage:   storage,
		config:    cfg,
		cancels:   make(map[string]context.CancelFunc),
		maxActive: cfg.Config.MaxParallelDownloads,
		mediaList: []models.MediaItem{},
	}

	app.ytdlp = services.NewYTService(app.getBinaryPath("yt-dlp"))
	app.media = services.NewMediaService(app.getBinaryPath("ffmpeg"))
	app.antivirus = services.NewAntivirusService(app.config.Config)

	return app
}

func (a *App) getBinaryPath(name string) string {
	// 1. Check current working directory's bin folder (useful for dev)
	cwd, _ := os.Getwd()
	cwdBin := filepath.Join(cwd, "bin", name)
	if _, err := os.Stat(cwdBin + ".exe"); err == nil {
		return cwdBin + ".exe"
	}
	if _, err := os.Stat(cwdBin); err == nil {
		return cwdBin
	}

	// 2. Check project bin folder (next to executable)
	exe, _ := os.Executable()
	localBin := filepath.Join(filepath.Dir(exe), "bin", name)
	if _, err := os.Stat(localBin + ".exe"); err == nil {
		return localBin + ".exe"
	}
	if _, err := os.Stat(localBin); err == nil {
		return localBin
	}

	// 3. Check system PATH
	if path, err := exec.LookPath(name); err == nil {
		return path
	}

	return name // Fallback to just the name
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.engine = downloader.NewEngine(func(task *models.DownloadTask) {
		runtime.EventsEmit(a.ctx, "download-progress", task)
	})

	// Apply saved config on startup
	if a.config.Config.SpeedLimitKBps > 0 {
		a.engine.SetGlobalSpeedLimit(int64(a.config.Config.SpeedLimitKBps) * 1024)
	}

	// Apply proxy settings
	a.applyProxyToEngine()

	// Keep PC awake during downloads if configured
	if a.config.Config.KeepPCAwake {
		a.keepAwake()
	}

	// Fix orphaned downloads that were interrupted (e.g., app crash)
	if tasks, err := a.storage.GetAllTasks(); err == nil {
		for _, t := range tasks {
			if t.Status == models.StatusDownloading {
				t.Status = models.StatusPaused
				a.storage.SaveTask(t)
			}
		}
	}

	go a.startInterceptionServer()
	go a.startQueueScheduler()
}

// applyProxyToEngine builds a proxy URL from config and updates the download engine.
func (a *App) applyProxyToEngine() {
	if a.engine == nil {
		return
	}
	cfg := a.config.Config
	var proxyURL string
	switch cfg.ProxyMode {
	case "http", "https":
		if cfg.ProxyHost != "" {
			if cfg.ProxyUser != "" {
				proxyURL = fmt.Sprintf("%s://%s:%s@%s:%d", cfg.ProxyMode, cfg.ProxyUser, cfg.ProxyPass, cfg.ProxyHost, cfg.ProxyPort)
			} else {
				proxyURL = fmt.Sprintf("%s://%s:%d", cfg.ProxyMode, cfg.ProxyHost, cfg.ProxyPort)
			}
		}
	case "socks5":
		if cfg.ProxyHost != "" {
			if cfg.ProxyUser != "" {
				proxyURL = fmt.Sprintf("socks5://%s:%s@%s:%d", cfg.ProxyUser, cfg.ProxyPass, cfg.ProxyHost, cfg.ProxyPort)
			} else {
				proxyURL = fmt.Sprintf("socks5://%s:%d", cfg.ProxyHost, cfg.ProxyPort)
			}
		}
	}
	a.engine.SetProxy(proxyURL)
}

func (a *App) startInterceptionServer() {
	http.HandleFunc("/intercept", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			return
		}
		var msg struct {
			Type string `json:"type"`
			URL  string `json:"url"`
			Data string `json:"data"`
		}
		if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
			return
		}

		// Emit event to frontend
		runtime.EventsEmit(a.ctx, "new-download-request", msg)
		fmt.Printf("Intercepted download: %s\n", msg.URL)

		// Check if it's media and add to media grabber
		if a.isMediaURL(msg.URL) {
			a.addMediaItem(msg.URL, msg.Data)
		}
	})

	log.Println("Interception server listening on :8844")
	http.ListenAndServe(":8844", nil)
}

// startQueueScheduler checks every 10 seconds to see if any scheduled queue should run
func (a *App) startQueueScheduler() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			a.checkSchedules()
		}
	}
}

func (a *App) checkSchedules() {
	queues, err := a.storage.GetQueues()
	if err != nil {
		return
	}

	now := time.Now()
	currentDay := int(now.Weekday())
	currentHHMM := now.Format("15:04")

	for _, q := range queues {
		if !q.IsScheduled || q.StartTime == "" {
			continue
		}

		// Check if today is an active day
		isDayActive := false
		for _, d := range q.DaysOfWeek {
			if d == currentDay {
				isDayActive = true
				break
			}
		}

		// If it's a specific day schedule and today isn't one, skip
		if len(q.DaysOfWeek) > 0 && !isDayActive {
			continue
		}

		// Start Time Check
		if currentHHMM == q.StartTime {
			a.StartQueue(q.ID)
		}

		// Stop Time Check
		if q.StopTime != "" && currentHHMM == q.StopTime {
			a.StopQueue(q.ID)
		}
	}
}

func (a *App) FetchVideoMetadata(url string) (*services.VideoMetadata, error) {
	isYoutube := strings.Contains(url, "youtube.com") || strings.Contains(url, "youtu.be")
	if !isYoutube {
		return nil, fmt.Errorf("URL is not a YouTube video")
	}

	// Check if yt-dlp exists before trying to fetch
	ytdlpPath := a.getBinaryPath("yt-dlp")
	if _, pathErr := exec.LookPath(ytdlpPath); pathErr != nil {
		return nil, fmt.Errorf("yt-dlp not found. Please wait for installation or restart app.")
	}

	return a.ytdlp.GetMetadata(url)
}

func (a *App) SelectFolder() (string, error) {
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Download Folder",
	})
	return path, err
}

func (a *App) ReadClipboard() (string, error) {
	text, err := runtime.ClipboardGetText(a.ctx)
	if err != nil {
		return "", err
	}

	// Basic validation if it's a URL
	text = strings.TrimSpace(text)
	if strings.HasPrefix(text, "http://") || strings.HasPrefix(text, "https://") {
		return text, nil
	}

	return "", fmt.Errorf("Clipboard does not contain a valid URL")
}

func (a *App) AddDownload(url string, filename string, savePath string, format string, queueId string, startNow bool) (*models.DownloadTask, error) {
	if a.storage == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	// Simple YouTube detection
	isYoutube := strings.Contains(url, "youtube.com") || strings.Contains(url, "youtu.be")

	var task *models.DownloadTask
	var err error

	if isYoutube {
		if filename == "" {
			meta, err := a.ytdlp.GetMetadata(url)
			if err == nil {
				filename = a.sanitizeFilename(meta.Title) + ".mp4"
			} else {
				filename = "youtube_video.mp4"
			}
		}

		task = &models.DownloadTask{
			URL:      url,
			Filename: filename,
			Format:   format,
			Status:   models.StatusQueued,
			Category: "video",
		}
	} else {
		task, err = a.engine.FetchMetadata(url)
		if err != nil {
			return nil, err
		}
		task.Category = a.getCategory(task.Filename)
	}

	task.ID = fmt.Sprintf("%d_%d", time.Now().UnixNano(), os.Getpid())
	if filename != "" {
		task.Filename = a.sanitizeFilename(filename)
		task.Category = a.getCategory(task.Filename)
	}

	// Determine save folder: explicit savePath > category folder > default folder > user Downloads
	if savePath == "" {
		// Try category-specific folder from config
		if catFolder, ok := a.config.Config.CategoryFolders[task.Category]; ok && catFolder != "" {
			savePath = catFolder
		} else if a.config.Config.DefaultDownloadFolder != "" {
			savePath = a.config.Config.DefaultDownloadFolder
		} else {
			savePath, _ = os.UserHomeDir()
			savePath = filepath.Join(savePath, "Downloads")
		}
	}

	// Ensure the folder exists
	os.MkdirAll(savePath, 0755)

	if queueId == "" {
		queueId = "main"
	}

	fullPath := filepath.Join(savePath, task.Filename)

	// File conflict resolution
	if a.config.Config.FileConflictMode == "autorename" {
		fullPath = a.resolveFileConflict(fullPath)
		task.Filename = filepath.Base(fullPath)
	}
	// If mode is "overwrite", we just use the path as-is

	task.SavePath = fullPath
	task.DateCreated = time.Now().Format(time.RFC3339)
	task.QueueID = queueId

	err = a.storage.SaveTask(task)
	if err != nil {
		return nil, fmt.Errorf("failed to save task: %v", err)
	}

	if startNow {
		go a.runDownload(task)
	} else {
		go a.ProcessQueue(queueId)
	}

	return task, nil
}

// resolveFileConflict appends (1), (2), etc. if a file already exists
func (a *App) resolveFileConflict(path string) string {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return path // No conflict
	}
	ext := filepath.Ext(path)
	base := strings.TrimSuffix(path, ext)
	for i := 1; i < 1000; i++ {
		newPath := fmt.Sprintf("%s (%d)%s", base, i, ext)
		if _, err := os.Stat(newPath); os.IsNotExist(err) {
			return newPath
		}
	}
	return path
}

func (a *App) sanitizeFilename(name string) string {
	// Remove invalid chars for Windows
	invalidChars := []string{"<", ">", ":", "\"", "/", "\\", "|", "?", "*"}
	for _, char := range invalidChars {
		name = strings.ReplaceAll(name, char, "_")
	}
	// Trim spaces and dots
	name = strings.TrimSpace(name)
	name = strings.Trim(name, ".")
	if name == "" {
		return "download"
	}
	return name
}

func (a *App) CheckDependencies() map[string]bool {
	deps := []string{"yt-dlp", "ffmpeg"}
	results := make(map[string]bool)
	for _, name := range deps {
		path := a.getBinaryPath(name)
		_, err := exec.LookPath(path)
		results[name] = err == nil
	}
	return results
}

func (a *App) getCategory(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".mp4", ".mkv", ".avi", ".wmv", ".flv", ".mov":
		return "video"
	case ".mp3", ".wav", ".flac", ".m4a", ".aac":
		return "music"
	case ".zip", ".rar", ".7z", ".tar", ".gz":
		return "compressed"
	case ".pdf", ".doc", ".docx", ".txt", ".xls", ".xlsx", ".ppt", ".pptx":
		return "documents"
	case ".exe", ".msi", ".dmg", ".pkg":
		return "programs"
	default:
		return "all"
	}
}

// ProcessQueue checks the number of active downloads for a specific queue and starts queued ones if there's room
func (a *App) ProcessQueue(queueId string) {
	if queueId == "" {
		queueId = "main" // Default safeguard
	}

	a.queueMu.Lock()
	defer a.queueMu.Unlock()

	tasks, err := a.storage.GetAllTasks()
	if err != nil {
		return
	}

	queues, err := a.storage.GetQueues()
	if err != nil {
		return
	}

	var targetQueue *models.DownloadQueue
	for _, q := range queues {
		if q.ID == queueId {
			targetQueue = q
			break
		}
	}
	if targetQueue == nil {
		return
	}

	activeCount := 0
	var queuedTasks []*models.DownloadTask

	for _, task := range tasks {
		if task.QueueID == queueId {
			if task.Status == models.StatusDownloading {
				activeCount++
			} else if task.Status == models.StatusQueued {
				queuedTasks = append(queuedTasks, task)
			}
		}
	}

	// Wait, we need to respect TaskIDs ordering if provided
	if len(targetQueue.TaskIDs) > 0 {
		var orderedQueuedTasks []*models.DownloadTask
		// Create map of queued tasks for quick lookup
		queuedMap := make(map[string]*models.DownloadTask)
		for _, task := range queuedTasks {
			queuedMap[task.ID] = task
		}
		// Pull out in order
		for _, id := range targetQueue.TaskIDs {
			if task, exists := queuedMap[id]; exists {
				orderedQueuedTasks = append(orderedQueuedTasks, task)
				delete(queuedMap, id)
			}
		}
		// Append any remaining tasks (added but not sorted)
		for _, task := range queuedMap {
			orderedQueuedTasks = append(orderedQueuedTasks, task)
		}
		queuedTasks = orderedQueuedTasks
	}

	for activeCount < targetQueue.MaxConcurrent && len(queuedTasks) > 0 {
		taskToStart := queuedTasks[0]
		queuedTasks = queuedTasks[1:]

		go a.runDownload(taskToStart)
		activeCount++
	}
}

func (a *App) runDownload(task *models.DownloadTask) {
	ctx, cancel := context.WithCancel(a.ctx)

	a.cancelMu.Lock()
	a.cancels[task.ID] = cancel
	a.cancelMu.Unlock()

	defer func() {
		a.cancelMu.Lock()
		delete(a.cancels, task.ID)
		a.cancelMu.Unlock()
	}()

	task.Status = models.StatusDownloading
	a.storage.SaveTask(task)
	runtime.EventsEmit(a.ctx, "download-progress", task)

	// Apply per-queue speed limit if set (takes precedence over global)
	if queues, err := a.storage.GetQueues(); err == nil {
		for _, q := range queues {
			if q.ID == task.QueueID && q.SpeedLimitKBps > 0 {
				a.engine.SetGlobalSpeedLimit(int64(q.SpeedLimitKBps) * 1024)
				defer func() {
					// Restore global limit when done
					a.engine.SetGlobalSpeedLimit(int64(a.config.Config.SpeedLimitKBps) * 1024)
				}()
				break
			}
		}
	}

	maxRetries := a.config.Config.MaxRetry
	retryDelay := a.config.Config.RetryDelay
	if maxRetries <= 0 {
		maxRetries = 1
	}
	if retryDelay <= 0 {
		retryDelay = 5
	}

	var err error
	isYoutube := strings.Contains(task.URL, "youtube.com") || strings.Contains(task.URL, "youtu.be")

	for attempt := 0; attempt < maxRetries; attempt++ {

		if isYoutube {
			ytdlpPath := a.getBinaryPath("yt-dlp")
			if _, pathErr := exec.LookPath(ytdlpPath); pathErr != nil {
				err = fmt.Errorf("yt-dlp not found. Please install it or place yt-dlp.exe in the 'bin' folder.")
			} else {
				err = a.ytdlp.Download(ctx, task.URL, task.Format, task.SavePath, func(downloaded, total int64, speed float64, eta int64) {
					task.DownloadedSize = downloaded
					if total > 0 {
						task.TotalSize = total
					} else if task.TotalSize == 0 {
						task.TotalSize = downloaded + 1024*1024
					}
					task.Speed = speed
					task.ETA = eta
					runtime.EventsEmit(a.ctx, "download-progress", task)
				})
			}
		} else {
			err = a.engine.Download(ctx, task)
		}

		if err == nil {
			break // Success
		}

		// If user cancelled (paused), don't retry
		if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
			break
		}

		// If we have retries left, wait and try again
		if attempt < maxRetries-1 {
			log.Printf("Download attempt %d/%d failed for %s: %v — retrying in %ds...", attempt+1, maxRetries, task.ID, err, retryDelay)
			time.Sleep(time.Duration(retryDelay) * time.Second)
			// Check if we were cancelled during the wait
			if ctx.Err() != nil {
				break
			}
		}
	}

	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
			task.Status = models.StatusPaused
		} else {
			task.Status = models.StatusError
			log.Printf("Download error for %s: %v (after %d attempts)", task.ID, err, maxRetries)
		}
	} else {
		task.Status = models.StatusCompleted
		task.DownloadedSize = task.TotalSize

		// Show completion notification (if enabled in config)
		if a.config.Config.ShowCompletionDialog {
			runtime.EventsEmit(a.ctx, "download-complete-notification", task)
		}

		// Run antivirus scan if configured
		if a.config.Config.ScanWithAntiVirus {
			go func(t *models.DownloadTask) {
				runtime.EventsEmit(a.ctx, "antivirus-scan-start", t.ID)
				result, err := a.antivirus.ScanFile(t.SavePath)
				if err == nil {
					runtime.EventsEmit(a.ctx, "antivirus-scan-result", map[string]interface{}{
						"taskId": t.ID,
						"result": result,
					})
					// If infected and quarantine is enabled, we could move file here
					if result.Status == services.ScanStatusInfected {
						log.Printf("THREAT DETECTED in %s: %v", t.Filename, result.Threats)
					}
				}
			}(task)
		}

		// Run custom command if configured (global)
		if a.config.Config.RunCommandAfterCompletion && a.config.Config.AfterCompletionCommand != "" {
			go exec.Command("cmd", "/C", a.config.Config.AfterCompletionCommand).Run()
		}
	}

	a.storage.SaveTask(task)
	runtime.EventsEmit(a.ctx, "download-progress", task)

	// After finishing/pausing/erroring, check if there's room for another download in this queue
	go a.ProcessQueue(task.QueueID)
	// Check if the whole queue is finished and trigger any post-completion action
	go a.checkQueueCompletion(task.QueueID)
}

func (a *App) PauseDownload(id string) error {
	a.cancelMu.Lock()
	cancel, ok := a.cancels[id]
	a.cancelMu.Unlock()

	// If there's an active process, cancel it and let it naturally wind down and save its state
	if ok {
		cancel()
		// We do not eagerly save the task status here to avoid a race condition
		// with `runDownload` saving its final accurate byte count.
		return nil
	}

	// Always update the state in the database if it wasn't actively downloading
	task, err := a.storage.GetTask(id)
	if err == nil {
		if task.Status == models.StatusDownloading || task.Status == models.StatusQueued {
			task.Status = models.StatusPaused
			a.storage.SaveTask(task)
			runtime.EventsEmit(a.ctx, "download-progress", task)
		}
	}

	// A slot opened up, process the queue
	if task != nil {
		go a.ProcessQueue(task.QueueID)
	}

	return nil
}

func (a *App) ResumeDownload(id string) error {
	task, err := a.storage.GetTask(id)
	if err != nil {
		return err
	}

	if task.Status == models.StatusDownloading {
		return nil
	}

	task.Status = models.StatusQueued
	a.storage.SaveTask(task)
	runtime.EventsEmit(a.ctx, "download-progress", task)

	a.ProcessQueue(task.QueueID)
	return nil
}

func (a *App) GetDownloads() ([]*models.DownloadTask, error) {
	return a.storage.GetAllTasks()
}

func (a *App) DeleteDownload(id string, deleteFile bool) error {
	task, err := a.storage.GetTask(id)
	if err != nil {
		return err
	}

	a.PauseDownload(id)

	if deleteFile {
		os.Remove(task.SavePath)
	}

	return a.storage.DeleteTask(id)
}

// OpenFile opens the downloaded file using the default system handler
func (a *App) OpenFile(id string) error {
	task, err := a.storage.GetTask(id)
	if err != nil {
		return err
	}
	if task.Status != models.StatusCompleted {
		return fmt.Errorf("file is not fully downloaded")
	}

	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", task.SavePath)
	return cmd.Start()
}

// OpenFolder opens the directory containing the file and selects it
func (a *App) OpenFolder(id string) error {
	task, err := a.storage.GetTask(id)
	if err != nil {
		return err
	}

	cmd := exec.Command("explorer", "/select,", task.SavePath)
	return cmd.Start()
}

// OpenInBrowser opens a URL in the default browser
func (a *App) OpenInBrowser(url string) {
	runtime.BrowserOpenURL(a.ctx, url)
}

// SetSpeedLimit sets the global download speed limit in KB/s. 0 means unlimited.
func (a *App) SetSpeedLimit(kbps int) {
	if a.engine != nil {
		a.engine.SetGlobalSpeedLimit(int64(kbps) * 1024)
	}
	a.config.Config.SpeedLimitKBps = kbps
	a.config.Save()
}

// GetConfig returns the current app configuration to the frontend
func (a *App) GetConfig() *models.AppConfig {
	return a.config.Config
}

// SaveConfig saves updated configuration from the frontend
func (a *App) SaveConfig(cfg *models.AppConfig) error {
	a.config.Config = cfg
	// Apply immediate effects
	a.maxActive = cfg.MaxParallelDownloads
	if a.engine != nil {
		a.engine.SetGlobalSpeedLimit(int64(cfg.SpeedLimitKBps) * 1024)
		a.applyProxyToEngine()
	}
	// Apply keep-awake setting
	if cfg.KeepPCAwake {
		a.keepAwake()
	} else {
		a.stopKeepAwake()
	}
	// Sync Windows autostart registry
	a.SetAutoStart(cfg.RunOnLogon)
	return a.config.Save()
}

// RefreshLink updates an expired download URL for a paused task
func (a *App) RefreshLink(id string, newUrl string) error {
	task, err := a.storage.GetTask(id)
	if err != nil {
		return err
	}

	if task.Status == models.StatusDownloading {
		return fmt.Errorf("cannot refresh link while downloading. pause first.")
	}

	task.URL = newUrl
	a.storage.SaveTask(task)
	runtime.EventsEmit(a.ctx, "download-progress", task)
	return nil
}

// --- Frontend Queue API ---

func (a *App) GetQueues() ([]*models.DownloadQueue, error) {
	return a.storage.GetQueues()
}

func (a *App) SaveQueue(q *models.DownloadQueue) error {
	// If it's a new queue, assign an ID
	if q.ID == "" {
		q.ID = fmt.Sprintf("q_%d", time.Now().UnixNano())
	}
	return a.storage.SaveQueue(q)
}

func (a *App) DeleteQueue(id string) error {
	return a.storage.DeleteQueue(id)
}

func (a *App) StartQueue(id string) error {
	if id == "" {
		id = "main"
	}

	tasks, err := a.storage.GetAllTasks()
	if err != nil {
		return err
	}

	// Mark all PAUSED/ERROR tasks in this queue as QUEUED so they can be processed
	for _, t := range tasks {
		if t.QueueID == id && (t.Status == models.StatusPaused || t.Status == models.StatusError) {
			t.Status = models.StatusQueued
			a.storage.SaveTask(t)
			runtime.EventsEmit(a.ctx, "download-progress", t)
		}
	}

	a.ProcessQueue(id)
	return nil
}

func (a *App) StopQueue(id string) error {
	if id == "" {
		id = "main"
	}

	tasks, err := a.storage.GetAllTasks()
	if err != nil {
		return err
	}

	for _, t := range tasks {
		if t.QueueID == id && (t.Status == models.StatusDownloading || t.Status == models.StatusQueued) {
			a.PauseDownload(t.ID)
		}
	}

	return nil
}

// executePostAction carries out the shutdown/sleep/hibernate command after a queue finishes
func (a *App) executePostAction(action string) {
	if action == "" {
		return
	}

	// Give a warning dialog so user can cancel
	result, _ := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:         runtime.WarningDialog,
		Title:        "Queue Complete — LodexPro",
		Message:      fmt.Sprintf("All downloads finished.\n\nComputer will %s in 30 seconds.\nClick Cancel to abort.", action),
		Buttons:      []string{"Cancel"},
		CancelButton: "Cancel",
	})

	if result == "Cancel" {
		return
	}

	switch action {
	case "shutdown":
		exec.Command("shutdown", "/s", "/t", "30").Run()
	case "sleep":
		exec.Command("rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0").Run()
	case "hibernate":
		exec.Command("shutdown", "/h").Run()
	}
}

// checkQueueCompletion is called after each task completes - if the whole queue is done, trigger postAction
func (a *App) checkQueueCompletion(queueId string) {
	if queueId == "" {
		return
	}

	queue, err := a.storage.GetQueues()
	if err != nil {
		return
	}

	var targetQueue *models.DownloadQueue
	for _, q := range queue {
		if q.ID == queueId {
			targetQueue = q
			break
		}
	}
	if targetQueue == nil || targetQueue.PostAction == "" {
		return
	}

	// Check if ALL tasks in this queue are COMPLETED
	// Only fire post-action if EVERY single task is finished successfully
	// Paused, Queued, Downloading, or Error tasks should block the action
	tasks, err := a.storage.GetAllTasks()
	if err != nil {
		return
	}

	hasQueueTasks := false
	for _, t := range tasks {
		if t.QueueID == queueId {
			hasQueueTasks = true
			if t.Status != models.StatusCompleted {
				return // There's still an incomplete task — don't fire
			}
		}
	}

	if !hasQueueTasks {
		return // Empty queue, nothing to act on
	}

	// All tasks in the queue are COMPLETED — execute the action
	go a.executePostAction(targetQueue.PostAction)
}

func (a *App) keepAwake() {
	exec.Command("powercfg", "/change", "standby-timeout-ac", "0").Run()
}

func (a *App) stopKeepAwake() {
	exec.Command("powercfg", "/change", "standby-timeout-ac", "30").Run()
}

// SetAutoStart enables/disables starting LodexPro on Windows login
func (a *App) SetAutoStart(enable bool) error {
	exePath, _ := os.Executable()
	if enable {
		cmd := exec.Command("reg", "add",
			`HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`,
			"/v", "LodexPro", "/t", "REG_SZ",
			"/d", fmt.Sprintf(`"%s" --background`, exePath),
			"/f")
		return cmd.Run()
	}
	cmd := exec.Command("reg", "delete",
		`HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`,
		"/v", "LodexPro", "/f")
	return cmd.Run()
}

// IsAutoStartEnabled checks if LodexPro is set to start on login
func (a *App) IsAutoStartEnabled() bool {
	cmd := exec.Command("reg", "query",
		`HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`,
		"/v", "LodexPro")
	err := cmd.Run()
	return err == nil
}
func (a *App) isMediaURL(url string) bool {
	mediaExts := []string{".mp4", ".m4v", ".mkv", ".webm", ".mov", ".avi", ".wmv", ".mpg", ".mpeg", ".mp3", ".m4a", ".aac", ".ogg", ".wav", ".flac", ".m3u8", ".mpd"}
	lowerURL := strings.ToLower(url)
	for _, ext := range mediaExts {
		if strings.Contains(lowerURL, ext) {
			return true
		}
	}
	return false
}

func (a *App) addMediaItem(url, description string) {
	a.mediaMu.Lock()
	defer a.mediaMu.Unlock()

	// Avoid duplicates
	for _, m := range a.mediaList {
		if m.URL == url {
			return
		}
	}

	filename := filepath.Base(url)
	if idx := strings.Index(filename, "?"); idx != -1 {
		filename = filename[:idx]
	}
	if filename == "" || filename == "." || filename == "/" {
		filename = "video_stream.mp4"
	}

	item := models.MediaItem{
		ID:          fmt.Sprintf("%d", time.Now().UnixNano()),
		URL:         url,
		Filename:    filename,
		Description: description,
		DateAdded:   time.Now().Format("2006-01-02 15:04:05"),
	}

	// Limit list size
	if len(a.mediaList) > 100 {
		a.mediaList = a.mediaList[1:]
	}
	a.mediaList = append(a.mediaList, item)
	runtime.EventsEmit(a.ctx, "media-grabber-update", a.mediaList)
}

func (a *App) GetMediaList() []models.MediaItem {
	a.mediaMu.Lock()
	defer a.mediaMu.Unlock()
	return a.mediaList
}

func (a *App) ClearMediaList() {
	a.mediaMu.Lock()
	defer a.mediaMu.Unlock()
	a.mediaList = []models.MediaItem{}
	runtime.EventsEmit(a.ctx, "media-grabber-update", a.mediaList)
}

func (a *App) RemoveMediaItem(id string) {
	a.mediaMu.Lock()
	defer a.mediaMu.Unlock()
	for i, m := range a.mediaList {
		if m.ID == id {
			a.mediaList = append(a.mediaList[:i], a.mediaList[i+1:]...)
			break
		}
	}
	runtime.EventsEmit(a.ctx, "media-grabber-update", a.mediaList)
}

func (a *App) CheckForUpdates() (*models.UpdateInfo, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get("https://api.github.com/repos/Mir-Hassan-Aslam/LodexPro-2.0/releases/latest")
	if err != nil {
		return &models.UpdateInfo{Available: false, Current: AppVersion}, err
	}
	defer resp.Body.Close()

	var release struct {
		TagName string `json:"tag_name"`
		HtmlUrl string `json:"html_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return &models.UpdateInfo{Available: false, Current: AppVersion}, err
	}

	return &models.UpdateInfo{
		Available: release.TagName != AppVersion && release.TagName != "",
		Current:   AppVersion,
		Latest:    release.TagName,
		Url:       "https://github.com/Mir-Hassan-Aslam/LodexPro-2.0/releases",
	}, nil
}

// GetVersion returns the current app version to the frontend.
func (a *App) GetVersion() string {
	return AppVersion
}

// ShowWindow brings the main window to the front (called from systray).
func (a *App) ShowWindow() {
	runtime.WindowShow(a.ctx)
}

// InstallDependency downloads yt-dlp or ffmpeg into the app's bin directory.
// It emits "dependency-progress" events with a float64 (0.0–1.0) for the UI.
func (a *App) InstallDependency(name string) error {
	exePath, _ := os.Executable()
	binDir := filepath.Join(filepath.Dir(exePath), "bin")

	// Also try CWD bin (for dev mode)
	cwd, _ := os.Getwd()
	if _, err := os.Stat(filepath.Join(cwd, "bin")); err == nil {
		binDir = filepath.Join(cwd, "bin")
	}

	onProgress := func(p float64) {
		runtime.EventsEmit(a.ctx, "dependency-progress", map[string]interface{}{
			"name":     name,
			"progress": p,
		})
	}

	var err error
	switch name {
	case "yt-dlp":
		err = services.DownloadYTDLP(binDir, onProgress)
	case "ffmpeg":
		err = services.DownloadFFmpeg(binDir, onProgress)
	default:
		return fmt.Errorf("unknown dependency: %s", name)
	}

	if err == nil {
		runtime.EventsEmit(a.ctx, "dependency-progress", map[string]interface{}{
			"name":     name,
			"progress": 1.0,
			"done":     true,
		})
	}
	return err
}

// ExportDownloads saves all download tasks to a user-chosen JSON file.
func (a *App) ExportDownloads() error {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export Downloads",
		DefaultFilename: "lodexpro_backup.json",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Files", Pattern: "*.json"},
		},
	})
	if err != nil || path == "" {
		return err
	}

	tasks, err := a.storage.GetAllTasks()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// ImportDownloads reads a JSON backup and re-adds all tasks as queued.
func (a *App) ImportDownloads() (int, error) {
	paths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Import Downloads",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Files", Pattern: "*.json"},
		},
	})
	if err != nil || len(paths) == 0 {
		return 0, err
	}

	data, err := os.ReadFile(paths[0])
	if err != nil {
		return 0, err
	}

	var tasks []*models.DownloadTask
	if err := json.Unmarshal(data, &tasks); err != nil {
		return 0, fmt.Errorf("invalid import file: %w", err)
	}

	count := 0
	for _, t := range tasks {
		// Assign a fresh ID so it doesn't conflict
		t.ID = fmt.Sprintf("import_%d_%d", time.Now().UnixNano(), count)
		t.Status = models.StatusQueued
		t.DownloadedSize = 0
		t.Segments = nil
		if err := a.storage.SaveTask(t); err == nil {
			count++
			runtime.EventsEmit(a.ctx, "download-progress", t)
		}
	}
	return count, nil
}

// RegisterBrowserExtension builds the native messaging host and registers it
// in the Windows registry for Chrome and Edge.
func (a *App) RegisterBrowserExtension() error {
	exePath, _ := os.Executable()
	appDir := filepath.Dir(exePath)

	// In dev mode, use the current working directory
	if cwd, err := os.Getwd(); err == nil {
		if _, e := os.Stat(filepath.Join(cwd, "wails.json")); e == nil {
			appDir = cwd
		}
	}

	hostExe := filepath.Join(appDir, "lodexpro-host.exe")
	manifestPath := filepath.Join(appDir, "com.lodexpro.host.json")

	// Build the native messaging host binary
	buildCmd := exec.Command("go", "build", "-o", hostExe, "./browser-host")
	buildCmd.Dir = appDir
	if out, err := buildCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to build host: %v — %s", err, string(out))
	}

	// Write the native messaging manifest
	manifest := map[string]interface{}{
		"name":        "com.lodexpro.host",
		"description": "LodexPro Download Manager Native Messaging Host",
		"path":        hostExe,
		"type":        "stdio",
		"allowed_origins": []string{
			"chrome-extension://*/",
		},
	}
	data, _ := json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(manifestPath, data, 0644); err != nil {
		return err
	}

	// Register in Windows registry for Chrome and Edge
	regPaths := []string{
		`Software\Google\Chrome\NativeMessagingHosts\com.lodexpro.host`,
		`Software\Microsoft\Edge\NativeMessagingHosts\com.lodexpro.host`,
	}
	for _, regPath := range regPaths {
		cmd := exec.Command("reg", "add",
			`HKCU\`+regPath,
			"/ve", "/t", "REG_SZ", "/d", manifestPath, "/f")
		cmd.Run() // best-effort — Edge/Chrome may not be installed
	}

	return nil
}

// GetExtensionInfo returns the path to the browser extension source folder
// so the user can load it as an unpacked extension.
func (a *App) GetExtensionInfo() map[string]string {
	exePath, _ := os.Executable()
	appDir := filepath.Dir(exePath)
	if cwd, err := os.Getwd(); err == nil {
		if _, e := os.Stat(filepath.Join(cwd, "wails.json")); e == nil {
			appDir = cwd
		}
	}
	extPath := filepath.Join(appDir, "..", "legacy_code", "browser_extension")
	return map[string]string{
		"extension_path": filepath.Clean(extPath),
		"chrome_url":     "chrome://extensions",
		"edge_url":       "edge://extensions",
	}
}

// PackageExtension zips the browser extension for distribution
func (a *App) PackageExtension() (string, error) {
	info := a.GetExtensionInfo()
	extPath := info["extension_path"]

	destPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save Extension Package",
		DefaultFilename: "lodexpro_extension.zip",
		Filters: []runtime.FileFilter{
			{DisplayName: "ZIP Files", Pattern: "*.zip"},
		},
	})
	if err != nil || destPath == "" {
		return "", err
	}

	err = a.zipFolder(extPath, destPath)
	return destPath, err
}

func (a *App) zipFolder(source, target string) error {
	zipfile, err := os.Create(target)
	if err != nil {
		return err
	}
	defer zipfile.Close()

	archive := zip.NewWriter(zipfile)
	defer archive.Close()

	filepath.Walk(source, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}

		header.Name, _ = filepath.Rel(source, path)
		if info.IsDir() {
			header.Name += "/"
		} else {
			header.Method = zip.Deflate
		}

		writer, err := archive.CreateHeader(header)
		if err != nil {
			return err
		}

		if info.IsDir() {
			return nil
		}

		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()
		_, err = io.Copy(writer, file)
		return err
	})

	return nil
}
