package services

import (
	"LodexPro/backend/models"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"time"
)

type ScanStatus string

const (
	ScanStatusPending     ScanStatus = "PENDING"
	ScanStatusScanning    ScanStatus = "SCANNING"
	ScanStatusClean       ScanStatus = "CLEAN"
	ScanStatusInfected    ScanStatus = "INFECTED"
	ScanStatusError       ScanStatus = "ERROR"
	ScanStatusQuarantined ScanStatus = "QUARANTINED"
	ScanStatusTimeout     ScanStatus = "TIMEOUT"
	ScanStatusSkipped     ScanStatus = "SKIPPED"
)

type ScanResult struct {
	FilePath     string     `json:"file_path"`
	Status       ScanStatus `json:"status"`
	Threats      []string   `json:"threats"`
	ScanTime     float64    `json:"scan_time"`
	ScanDate     string     `json:"scan_date"`
	ErrorMessage string     `json:"error_message"`
	FileHash     string     `json:"file_hash"`
}

type AntivirusService struct {
	config *models.AppConfig
}

func NewAntivirusService(cfg *models.AppConfig) *AntivirusService {
	return &AntivirusService{config: cfg}
}

func (s *AntivirusService) ScanFile(filePath string) (*ScanResult, error) {
	if !s.config.ScanWithAntiVirus {
		return &ScanResult{FilePath: filePath, Status: ScanStatusSkipped}, nil
	}

	start := time.Now()
	hash, _ := s.CalculateHash(filePath)
	result := &ScanResult{
		FilePath: filePath,
		Status:   ScanStatusScanning,
		ScanDate: time.Now().Format("2006-01-02 15:04:05"),
		FileHash: hash,
	}

	// Try Windows Defender if enabled and on Windows
	if runtime.GOOS == "windows" {
		if s.config.AntiVirusExecutable == "" || s.config.AntiVirusExecutable == "defender" {
			err := s.scanWithDefender(filePath, result)
			if err == nil {
				result.ScanTime = time.Since(start).Seconds()
				return result, nil
			}
		}
	}

	// Try custom executable if configured
	if s.config.AntiVirusExecutable != "" && s.config.AntiVirusExecutable != "defender" {
		err := s.scanWithCustom(filePath, result)
		if err == nil {
			result.ScanTime = time.Since(start).Seconds()
			return result, nil
		}
	}

	// Try VirusTotal if API key is provided
	if s.config.VirusTotalAPIKey != "" {
		err := s.scanWithVirusTotal(hash, result)
		if err == nil {
			result.ScanTime = time.Since(start).Seconds()
			return result, nil
		}
	}

	result.Status = ScanStatusError
	result.ErrorMessage = "No active antivirus engine could perform the scan."
	result.ScanTime = time.Since(start).Seconds()
	return result, nil
}

func (s *AntivirusService) scanWithDefender(filePath string, result *ScanResult) error {
	// PowerShell command to scan path and check for active threats
	cmdStr := fmt.Sprintf(`Start-MpScan -ScanPath "%s" -ScanType QuickScan; $threat = Get-MpThreatDetection | Where-Object { $_.Resources.Path -eq "%s" -and $_.ThreatStatusID -eq 1 }; if ($threat) { exit 1 } else { exit 0 }`, filePath, filePath)
	cmd := exec.Command("powershell", "-Command", cmdStr)

	err := cmd.Run()
	if err == nil {
		result.Status = ScanStatusClean
		return nil
	}

	if exitError, ok := err.(*exec.ExitError); ok {
		if exitError.ExitCode() == 1 {
			result.Status = ScanStatusInfected
			result.Threats = append(result.Threats, "Threat detected by Windows Defender")
			return nil
		}
	}

	return err
}

func (s *AntivirusService) scanWithCustom(filePath string, result *ScanResult) error {
	args := []string{filePath}
	if s.config.AntiVirusArgs != "" {
		args = append([]string{s.config.AntiVirusArgs}, filePath)
	}

	cmd := exec.Command(s.config.AntiVirusExecutable, args...)
	err := cmd.Run()
	if err == nil {
		result.Status = ScanStatusClean
		return nil
	}

	// Many AVs return non-zero for infection
	result.Status = ScanStatusInfected
	result.Threats = append(result.Threats, fmt.Sprintf("Scan failed or threat detected by %s", s.config.AntiVirusExecutable))
	return nil
}

func (s *AntivirusService) scanWithVirusTotal(hash string, result *ScanResult) error {
	if s.config.VirusTotalAPIKey == "" || hash == "" {
		return fmt.Errorf("missing VirusTotal API key or file hash")
	}

	url := fmt.Sprintf("https://www.virustotal.com/api/v3/files/%s", hash)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("x-apikey", s.config.VirusTotalAPIKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		result.Status = ScanStatusClean
		result.Threats = append(result.Threats, "File not found on VirusTotal (Unknown).")
		return nil
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("virustotal api error: %d", resp.StatusCode)
	}

	var vtData struct {
		Data struct {
			Attributes struct {
				LastAnalysisStats struct {
					Malicious int `json:"malicious"`
				} `json:"last_analysis_stats"`
			} `json:"attributes"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&vtData); err != nil {
		return err
	}

	if vtData.Data.Attributes.LastAnalysisStats.Malicious > 0 {
		result.Status = ScanStatusInfected
		result.Threats = append(result.Threats, fmt.Sprintf("%d engines flagged this file on VirusTotal", vtData.Data.Attributes.LastAnalysisStats.Malicious))
	} else {
		result.Status = ScanStatusClean
	}

	return nil
}

func (s *AntivirusService) CalculateHash(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return hex.EncodeToString(h.Sum(nil)), nil
}
