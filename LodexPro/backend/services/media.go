package services

import (
	"os/exec"
	"fmt"
)

type MediaService struct {
	ffmpegPath string
}

func NewMediaService(ffmpegPath string) *MediaService {
	return &MediaService{ffmpegPath: ffmpegPath}
}

func (s *MediaService) MergeStreams(videoPath, audioPath, outputPath string) error {
	cmd := exec.Command(s.ffmpegPath, 
		"-i", videoPath, 
		"-i", audioPath, 
		"-c", "copy", 
		outputPath,
	)
	
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg error: %v, output: %s", err, string(output))
	}
	return nil
}

func (s *MediaService) ConvertToMp3(inputPath, outputPath string) error {
	cmd := exec.Command(s.ffmpegPath, 
		"-i", inputPath, 
		"-vn", 
		"-acodec", "libmp3lame", 
		"-q:a", "2", 
		outputPath,
	)
	
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg error: %v, output: %s", err, string(output))
	}
	return nil
}
