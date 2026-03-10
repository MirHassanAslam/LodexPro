package services

import (
	"LodexPro/backend/models"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	_ "modernc.org/sqlite"
)

type Storage struct {
	db *sql.DB
}

func NewStorage(dbPath string) (*Storage, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	// Create tables if not exist
	query := `
    CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        url TEXT,
        filename TEXT,
        save_path TEXT,
        total_size INTEGER,
        downloaded_size INTEGER,
        status TEXT,
        category TEXT,
        date_created DATETIME
    );
    CREATE TABLE IF NOT EXISTS segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        download_id TEXT,
        start_byte INTEGER,
        end_byte INTEGER,
        downloaded_size INTEGER,
        completed BOOLEAN,
        UNIQUE(download_id, start_byte, end_byte),
        FOREIGN KEY(download_id) REFERENCES downloads(id)
    );`

	_, err = db.Exec(query)
	// Add format column if it doesn't exist (updates older DBs)
	_, _ = db.Exec(`ALTER TABLE downloads ADD COLUMN format TEXT DEFAULT ''`)
	// Add queue_id column if it doesn't exist
	_, _ = db.Exec(`ALTER TABLE downloads ADD COLUMN queue_id TEXT DEFAULT 'main'`)

	// Create queues table
	_, err = db.Exec(`
    CREATE TABLE IF NOT EXISTS queues (
        id TEXT PRIMARY KEY,
        name TEXT,
        is_default BOOLEAN,
        max_concurrent INTEGER,
        start_time TEXT,
        stop_time TEXT,
        is_scheduled BOOLEAN,
        days_of_week TEXT,
        task_ids TEXT,
        post_action TEXT DEFAULT '',
        speed_limit_kbps INTEGER DEFAULT 0
    );`)

	storage := &Storage{db: db}
	storage.ensureMainQueue()

	return storage, err
}

func (s *Storage) ensureMainQueue() {
	var count int
	s.db.QueryRow(`SELECT COUNT(*) FROM queues WHERE id = 'main'`).Scan(&count)
	if count == 0 {
		_, _ = s.db.Exec(`
			INSERT INTO queues (id, name, is_default, max_concurrent, start_time, stop_time, is_scheduled, days_of_week, task_ids, post_action)
			VALUES ('main', 'Main download queue', 1, 4, '', '', 0, '[]', '[]', '')
		`)
	}
}

func (s *Storage) SaveTask(task *models.DownloadTask) error {
	if task.QueueID == "" {
		task.QueueID = "main"
	}
	_, err := s.db.Exec(`
		INSERT INTO downloads (id, url, filename, save_path, total_size, downloaded_size, status, category, date_created, format, queue_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			downloaded_size = excluded.downloaded_size,
			status = excluded.status,
			category = excluded.category,
			format = excluded.format,
			queue_id = excluded.queue_id
	`, task.ID, task.URL, task.Filename, task.SavePath, task.TotalSize, task.DownloadedSize, task.Status, task.Category, task.DateCreated, task.Format, task.QueueID)
	if err != nil {
		return err
	}

	for _, seg := range task.Segments {
		_, err = s.db.Exec(`
			INSERT INTO segments (download_id, start_byte, end_byte, downloaded_size, completed)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(download_id, start_byte, end_byte) DO UPDATE SET
				downloaded_size = excluded.downloaded_size,
				completed = excluded.completed
		`, task.ID, seg.StartByte, seg.EndByte, seg.DownloadedSize, seg.Completed)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Storage) GetTask(id string) (*models.DownloadTask, error) {
	task := &models.DownloadTask{}

	// Check if queue_id and format columns exist (we might have failed to create them)
	err := s.db.QueryRow(`
		SELECT id, url, filename, save_path, total_size, downloaded_size, status, category, date_created, format, queue_id
		FROM downloads WHERE id = ?
	`, id).Scan(&task.ID, &task.URL, &task.Filename, &task.SavePath, &task.TotalSize, &task.DownloadedSize, &task.Status, &task.Category, &task.DateCreated, &task.Format, &task.QueueID)

	if err != nil {
		// Fallback for older DB versions without queue_id
		err = s.db.QueryRow(`
			SELECT id, url, filename, save_path, total_size, downloaded_size, status, category, date_created, format
			FROM downloads WHERE id = ?
		`, id).Scan(&task.ID, &task.URL, &task.Filename, &task.SavePath, &task.TotalSize, &task.DownloadedSize, &task.Status, &task.Category, &task.DateCreated, &task.Format)
		if err != nil {
			// Fallback for really old DB versions
			err = s.db.QueryRow(`
				SELECT id, url, filename, save_path, total_size, downloaded_size, status, category, date_created
				FROM downloads WHERE id = ?
			`, id).Scan(&task.ID, &task.URL, &task.Filename, &task.SavePath, &task.TotalSize, &task.DownloadedSize, &task.Status, &task.Category, &task.DateCreated)
			if err != nil {
				return nil, err
			}
		}
		if task.QueueID == "" {
			task.QueueID = "main" // Default if missing
		}
	}

	rows, err := s.db.Query(`
		SELECT id, start_byte, end_byte, downloaded_size, completed
		FROM segments WHERE download_id = ?
	`, id)
	if err != nil {
		return task, nil // Return task even if segments fail
	}
	defer rows.Close()

	for rows.Next() {
		var seg models.Segment
		if err := rows.Scan(&seg.ID, &seg.StartByte, &seg.EndByte, &seg.DownloadedSize, &seg.Completed); err == nil {
			task.Segments = append(task.Segments, seg)
		}
	}

	return task, nil
}

func (s *Storage) GetAllTasks() ([]*models.DownloadTask, error) {
	// Query 1: fetch all tasks at once
	rows, err := s.db.Query(`
		SELECT id, url, filename, save_path, total_size, downloaded_size, status, 
		       category, date_created, IFNULL(format,''), IFNULL(queue_id,'main')
		FROM downloads ORDER BY date_created DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []*models.DownloadTask
	taskMap := map[string]*models.DownloadTask{}

	for rows.Next() {
		t := &models.DownloadTask{}
		if err := rows.Scan(&t.ID, &t.URL, &t.Filename, &t.SavePath, &t.TotalSize,
			&t.DownloadedSize, &t.Status, &t.Category, &t.DateCreated, &t.Format, &t.QueueID); err == nil {
			t.Segments = []models.Segment{}
			tasks = append(tasks, t)
			taskMap[t.ID] = t
		}
	}
	rows.Close()

	if len(tasks) == 0 {
		return tasks, nil
	}

	// Query 2: bulk-fetch all segments in a single query using IN (...)
	placeholders := make([]string, len(tasks))
	args := make([]interface{}, len(tasks))
	for i, t := range tasks {
		placeholders[i] = "?"
		args[i] = t.ID
	}
	segSQL := fmt.Sprintf(
		`SELECT id, download_id, start_byte, end_byte, downloaded_size, completed FROM segments WHERE download_id IN (%s)`,
		strings.Join(placeholders, ","),
	)
	segRows, err := s.db.Query(segSQL, args...)
	if err == nil {
		defer segRows.Close()
		for segRows.Next() {
			var seg models.Segment
			var taskID string
			if err := segRows.Scan(&seg.ID, &taskID, &seg.StartByte, &seg.EndByte, &seg.DownloadedSize, &seg.Completed); err == nil {
				if t, ok := taskMap[taskID]; ok {
					t.Segments = append(t.Segments, seg)
				}
			}
		}
	}

	return tasks, nil
}

func (s *Storage) DeleteTask(id string) error {
	_, err := s.db.Exec(`DELETE FROM segments WHERE download_id = ?`, id)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`DELETE FROM downloads WHERE id = ?`, id)
	return err
}

// --- Queue Management Methods ---

func (s *Storage) SaveQueue(q *models.DownloadQueue) error {
	daysBytes, _ := json.Marshal(q.DaysOfWeek)
	tasksBytes, _ := json.Marshal(q.TaskIDs)

	// Ensure columns exist (for older DBs)
	_, _ = s.db.Exec(`ALTER TABLE queues ADD COLUMN post_action TEXT DEFAULT ''`)
	_, _ = s.db.Exec(`ALTER TABLE queues ADD COLUMN speed_limit_kbps INTEGER DEFAULT 0`)

	_, err := s.db.Exec(`
		INSERT INTO queues (id, name, is_default, max_concurrent, start_time, stop_time, is_scheduled, days_of_week, task_ids, post_action, speed_limit_kbps)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			is_default = excluded.is_default,
			max_concurrent = excluded.max_concurrent,
			start_time = excluded.start_time,
			stop_time = excluded.stop_time,
			is_scheduled = excluded.is_scheduled,
			days_of_week = excluded.days_of_week,
			task_ids = excluded.task_ids,
			post_action = excluded.post_action,
			speed_limit_kbps = excluded.speed_limit_kbps
	`, q.ID, q.Name, q.IsDefault, q.MaxConcurrent, q.StartTime, q.StopTime, q.IsScheduled, string(daysBytes), string(tasksBytes), q.PostAction, q.SpeedLimitKBps)
	return err
}

func (s *Storage) GetQueues() ([]*models.DownloadQueue, error) {
	rows, err := s.db.Query(`
		SELECT id, name, is_default, max_concurrent, start_time, stop_time, is_scheduled, days_of_week, task_ids, IFNULL(post_action, ''), IFNULL(speed_limit_kbps, 0)
		FROM queues ORDER BY is_default DESC, name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var queues []*models.DownloadQueue
	for rows.Next() {
		var q models.DownloadQueue
		var daysStr, tasksStr string
		err := rows.Scan(&q.ID, &q.Name, &q.IsDefault, &q.MaxConcurrent, &q.StartTime, &q.StopTime, &q.IsScheduled, &daysStr, &tasksStr, &q.PostAction, &q.SpeedLimitKBps)
		if err == nil {
			json.Unmarshal([]byte(daysStr), &q.DaysOfWeek)
			json.Unmarshal([]byte(tasksStr), &q.TaskIDs)
			if q.DaysOfWeek == nil {
				q.DaysOfWeek = []int{}
			}
			if q.TaskIDs == nil {
				q.TaskIDs = []string{}
			}
			queues = append(queues, &q)
		}
	}
	return queues, nil
}

func (s *Storage) DeleteQueue(id string) error {
	if id == "main" {
		return nil // Cannot delete main queue
	}
	_, err := s.db.Exec(`DELETE FROM queues WHERE id = ?`, id)
	if err == nil {
		// Move its tasks to main queue
		s.db.Exec(`UPDATE downloads SET queue_id = 'main' WHERE queue_id = ?`, id)
	}
	return err
}
