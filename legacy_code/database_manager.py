import sqlite3
import os
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class DatabaseManager:
    """Manages SQLite database for persisting download history."""
    
    def __init__(self, db_path="lodifypro.db"):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        """Initialize the database schema."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS downloads (
                        id TEXT PRIMARY KEY,
                        url TEXT NOT NULL,
                        destination TEXT NOT NULL,
                        filename TEXT,
                        filepath TEXT,
                        state TEXT,
                        progress REAL DEFAULT 0,
                        total_size INTEGER DEFAULT 0,
                        downloaded_size INTEGER DEFAULT 0,
                        quality TEXT DEFAULT 'best',
                        is_youtube INTEGER DEFAULT 0,
                        error_message TEXT DEFAULT '',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                conn.commit()
                logger.info("Database initialized successfully.")
        except sqlite3.Error as e:
            logger.error(f"Error initializing database: {e}")

    def save_download(self, item_dict: Dict[str, Any]):
        """Saves a new download or updates an existing one."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT OR REPLACE INTO downloads (
                        id, url, destination, filename, filepath, 
                        state, progress, total_size, downloaded_size, 
                        quality, is_youtube, error_message
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    item_dict['id'], item_dict['url'], item_dict['destination'],
                    item_dict['filename'], item_dict['filepath'], item_dict['state'],
                    item_dict['progress'], item_dict['total_size'], item_dict['downloaded_size'],
                    item_dict['quality'], 1 if item_dict['is_youtube'] else 0,
                    item_dict['error_message']
                ))
                conn.commit()
        except sqlite3.Error as e:
            logger.error(f"Error saving download to DB: {e}")

    def update_progress(self, item_id: str, progress: float, downloaded: int, total: int, speed: float = 0):
        """Periodically update progress-related fields."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE downloads SET 
                        progress = ?, 
                        downloaded_size = ?, 
                        total_size = ?
                    WHERE id = ?
                """, (progress, downloaded, total, item_id))
                conn.commit()
        except sqlite3.Error as e:
            logger.debug(f"Error updating progress in DB: {e}")

    def update_state(self, item_id: str, state: str, error_message: str = ""):
        """Update the state of a download."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE downloads SET state = ?, error_message = ? WHERE id = ?
                """, (state, error_message, item_id))
                conn.commit()
        except sqlite3.Error as e:
            logger.error(f"Error updating state in DB: {e}")

    def get_all_downloads(self) -> List[Dict[str, Any]]:
        """Retrieves all downloads from the database."""
        downloads = []
        try:
            with self._get_connection() as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM downloads ORDER BY created_at DESC")
                for row in cursor.fetchall():
                    d = dict(row)
                    d['is_youtube'] = bool(d['is_youtube'])
                    downloads.append(d)
        except sqlite3.Error as e:
            logger.error(f"Error loading downloads from DB: {e}")
        return downloads

    def delete_download(self, item_id: str):
        """Removes a download from the database."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM downloads WHERE id = ?", (item_id,))
                conn.commit()
        except sqlite3.Error as e:
            logger.error(f"Error deleting download from DB: {e}")
