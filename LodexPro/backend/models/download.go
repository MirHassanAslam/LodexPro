package models

type DownloadStatus string

const (
	StatusQueued      DownloadStatus = "QUEUED"
	StatusDownloading DownloadStatus = "DOWNLOADING"
	StatusPaused      DownloadStatus = "PAUSED"
	StatusCompleted   DownloadStatus = "COMPLETED"
	StatusError       DownloadStatus = "ERROR"
)

type DownloadTask struct {
	ID             string         `json:"id"`
	URL            string         `json:"url"`
	Filename       string         `json:"filename"`
	SavePath       string         `json:"save_path"`
	TotalSize      int64          `json:"total_size"`
	DownloadedSize int64          `json:"downloaded_size"`
	Status         DownloadStatus `json:"status"`
	Category       string         `json:"category"`
	Format         string         `json:"format"`
	QueueID        string         `json:"queue_id"`
	Segments       []Segment      `json:"segments"`
	DateCreated    string         `json:"date_created"`
	Speed          float64        `json:"speed"` // bytes per second
	ETA            int64          `json:"eta"`   // seconds remaining
}

type DownloadQueue struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	IsDefault      bool     `json:"is_default"` // Only true for "Main download queue"
	MaxConcurrent  int      `json:"max_concurrent"`
	SpeedLimitKBps int      `json:"speed_limit_kbps"` // 0 = unlimited (per-queue cap)
	StartTime      string   `json:"start_time"`       // ISO or HH:mm format
	StopTime       string   `json:"stop_time"`
	IsScheduled    bool     `json:"is_scheduled"`
	DaysOfWeek     []int    `json:"days_of_week"` // e.g. [0,1,2,3,4,5,6]
	TaskIDs        []string `json:"task_ids"`     // Ordered list of tasks in this queue
	PostAction     string   `json:"post_action"`  // "", "shutdown", "sleep", "hibernate"
}

type Segment struct {
	ID             int   `json:"id"`
	StartByte      int64 `json:"start_byte"`
	EndByte        int64 `json:"end_byte"`
	DownloadedSize int64 `json:"downloaded_size"`
	Completed      bool  `json:"completed"`
}

type MediaItem struct {
	ID          string `json:"id"`
	URL         string `json:"url"`
	Filename    string `json:"filename"`
	Description string `json:"description"`
	Size        int64  `json:"size"`
	DateAdded   string `json:"date_added"`
}

type UpdateInfo struct {
	Available bool   `json:"available"`
	Current   string `json:"current"`
	Latest    string `json:"latest"`
	Url       string `json:"url"`
}
