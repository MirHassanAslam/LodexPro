package services

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

type VideoFormat struct {
	FormatID   string  `json:"format_id"`
	Extension  string  `json:"ext"`
	Resolution string  `json:"resolution"`
	Filesize   int64   `json:"filesize"`
	VCodec     string  `json:"vcodec"`
	ACodec     string  `json:"acodec"`
}

type VideoMetadata struct {
	ID          string        `json:"id"`
	Title       string        `json:"title"`
	Description string        `json:"description"`
	Duration    float64       `json:"duration"`
	Formats     []VideoFormat `json:"formats"`
}

type YTService struct {
	ytdlpPath string
}

func NewYTService(path string) *YTService {
	return &YTService{ytdlpPath: path}
}

func (s *YTService) GetMetadata(url string) (*VideoMetadata, error) {
	cmd := exec.Command(s.ytdlpPath, "-j", url)
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("yt-dlp error: %v, output: %s", err, string(output))
	}

	var meta VideoMetadata
	if err := json.Unmarshal(output, &meta); err != nil {
		return nil, err
	}

	return &meta, nil
}
func (s *YTService) Download(ctx context.Context, url string, format string, outputPath string, onProgress func(downloaded, total int64, speed float64, eta int64)) error {
	args := []string{
		"-o", outputPath,
		"--newline",
		"--progress-template", "download-progress:%(progress.downloaded_bytes)s:%(progress.total_bytes)s:%(progress.speed)s:%(progress.eta)s",
	}

	if format != "" && format != "best" {
		args = append(args, "-f", format)
	}
	args = append(args, url)

	cmd := exec.Command(s.ytdlpPath, args...)
	
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return err
	}

	processDone := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			if cmd.Process != nil {
				if runtime.GOOS == "windows" {
					exec.Command("taskkill", "/T", "/F", "/PID", fmt.Sprint(cmd.Process.Pid)).Run()
				} else {
					cmd.Process.Kill()
				}
			}
		case <-processDone:
		}
	}()

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "download-progress:") {
			parts := strings.Split(strings.TrimPrefix(line, "download-progress:"), ":")
			if len(parts) == 4 {
				var downloaded, total, eta int64
				var speed float64
				
				fmt.Sscanf(parts[0], "%d", &downloaded)
				if parts[1] != "NA" {
					fmt.Sscanf(parts[1], "%d", &total)
				}
				if parts[2] != "NA" {
					fmt.Sscanf(parts[2], "%f", &speed)
				}
				if parts[3] != "NA" {
					fmt.Sscanf(parts[3], "%d", &eta)
				}
				
				if onProgress != nil {
					onProgress(downloaded, total, speed, eta)
				}
			}
		}
	}

	err = cmd.Wait()
	close(processDone)
	
	if ctx.Err() != nil {
		return ctx.Err()
	}

	return err
}
