package models

type AppConfig struct {
	MaxSegments          int `json:"max_segments"`
	NetworkTimeout       int `json:"network_timeout"`
	MaxRetry             int `json:"max_retry"`
	RetryDelay           int `json:"retry_delay"`
	MaxParallelDownloads int `json:"max_parallel_downloads"`
	SpeedLimitKBps       int `json:"speed_limit_kbps"`

	DefaultDownloadFolder string            `json:"default_download_folder"`
	FileConflictMode      string            `json:"file_conflict_mode"`
	TempDir               string            `json:"temp_dir"`
	CategoryFolders       map[string]string `json:"category_folders"`

	StartDownloadAutomatically bool     `json:"start_download_automatically"`
	ShowCompletionDialog       bool     `json:"show_completion_dialog"`
	MonitorClipboard           bool     `json:"monitor_clipboard"`
	RunOnLogon                 bool     `json:"run_on_logon"`
	KeepPCAwake                bool     `json:"keep_pc_awake"`
	BlockedHosts               []string `json:"blocked_hosts"`

	RunCommandAfterCompletion bool   `json:"run_command_after_completion"`
	AfterCompletionCommand    string `json:"after_completion_command"`

	ScanWithAntiVirus   bool   `json:"scan_with_antivirus"`
	AntiVirusExecutable string `json:"antivirus_executable"`
	AntiVirusArgs       string `json:"antivirus_args"`
	VirusTotalAPIKey    string `json:"virustotal_api_key"`

	ProxyMode string `json:"proxy_mode"`
	ProxyHost string `json:"proxy_host"`
	ProxyPort int    `json:"proxy_port"`
	ProxyUser string `json:"proxy_user"`
	ProxyPass string `json:"proxy_pass"`
}

func DefaultConfig() *AppConfig {
	return &AppConfig{
		MaxSegments:          8,
		NetworkTimeout:       30,
		MaxRetry:             5,
		RetryDelay:           5,
		MaxParallelDownloads: 3,
		FileConflictMode:     "autorename",
		ShowCompletionDialog: true,
		MonitorClipboard:     true,
		KeepPCAwake:          true,
		CategoryFolders: map[string]string{
			"documents":  "",
			"music":      "",
			"video":      "",
			"compressed": "",
			"programs":   "",
		},
		BlockedHosts: []string{
			"update.microsoft.com",
			"windowsupdate.com",
		},
		ProxyMode: "none",
	}
}
