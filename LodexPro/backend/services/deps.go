package services

import (
	"archive/zip"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const (
	ytdlpURL  = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
	ffmpegURL = "https://github.com/BtbN/ffmpeg-builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
)

// DownloadYTDLP downloads yt-dlp.exe into binDir, reporting progress via onProgress (0.0–1.0).
func DownloadYTDLP(binDir string, onProgress func(float64)) error {
	os.MkdirAll(binDir, 0755)
	dest := filepath.Join(binDir, "yt-dlp.exe")
	return downloadFile(ytdlpURL, dest, onProgress)
}

// DownloadFFmpeg downloads the ffmpeg zip and extracts ffmpeg.exe into binDir.
func DownloadFFmpeg(binDir string, onProgress func(float64)) error {
	os.MkdirAll(binDir, 0755)

	// Download zip to a temp file
	tmpFile, err := os.CreateTemp("", "ffmpeg-*.zip")
	if err != nil {
		return err
	}
	tmpPath := tmpFile.Name()
	tmpFile.Close()
	defer os.Remove(tmpPath)

	if err := downloadFile(ffmpegURL, tmpPath, func(p float64) {
		// First 90% is download, last 10% is extraction
		if onProgress != nil {
			onProgress(p * 0.9)
		}
	}); err != nil {
		return err
	}

	// Extract ffmpeg.exe from zip
	if err := extractFFmpegFromZip(tmpPath, binDir); err != nil {
		return err
	}

	if onProgress != nil {
		onProgress(1.0)
	}
	return nil
}

func downloadFile(url, dest string, onProgress func(float64)) error {
	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("server returned %d for %s", resp.StatusCode, url)
	}

	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()

	total := resp.ContentLength
	var downloaded int64
	buf := make([]byte, 64*1024)

	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := f.Write(buf[:n]); writeErr != nil {
				return writeErr
			}
			downloaded += int64(n)
			if onProgress != nil && total > 0 {
				onProgress(float64(downloaded) / float64(total))
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
	}

	if onProgress != nil {
		onProgress(1.0)
	}
	return nil
}

func extractFFmpegFromZip(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		// Find ffmpeg.exe at any depth
		if filepath.Base(f.Name) == "ffmpeg.exe" && !strings.Contains(f.Name, "ffprobe") {
			rc, err := f.Open()
			if err != nil {
				return err
			}
			defer rc.Close()

			outPath := filepath.Join(destDir, "ffmpeg.exe")
			out, err := os.Create(outPath)
			if err != nil {
				return err
			}
			defer out.Close()

			_, err = io.Copy(out, rc)
			return err
		}
	}
	return fmt.Errorf("ffmpeg.exe not found in zip")
}
