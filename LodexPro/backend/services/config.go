package services

import (
	"encoding/json"
	"os"
	"path/filepath"
	"LodexPro/backend/models"
)

type ConfigService struct {
	configPath string
	Config     *models.AppConfig
}

func NewConfigService(baseDir string) *ConfigService {
	cs := &ConfigService{
		configPath: filepath.Join(baseDir, "config.json"),
		Config:     models.DefaultConfig(),
	}
	cs.Load()
	return cs
}

func (cs *ConfigService) Load() {
	data, err := os.ReadFile(cs.configPath)
	if err != nil {
		return // Use defaults
	}
	// Unmarshal over defaults so any missing fields keep their defaults
	json.Unmarshal(data, cs.Config)
}

func (cs *ConfigService) Save() error {
	data, err := json.MarshalIndent(cs.Config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(cs.configPath, data, 0644)
}
