"""
LodifyPro 2.0 - Main Application (PyQt6)
UI layer only — download engine is untouched.
"""
import sys
import os
import queue
import threading
import logging
import shutil

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QHBoxLayout, QVBoxLayout,
    QLabel, QPushButton, QFrame, QScrollArea, QLineEdit,
    QSizePolicy, QSpacerItem, QProgressBar, QStackedWidget, QMessageBox,
    QGridLayout, QSpinBox
)
from PyQt6.QtCore import (
    Qt, QTimer, QPropertyAnimation, QEasingCurve, QSize, pyqtSlot
)
from PyQt6.QtGui import QFont, QIcon, QColor

# ── Protected download engine (DO NOT TOUCH) ───────────────────────────────
from multilingual_manager import LocaleManager
from antivirus_manager import AntivirusManager
from settings_manager import SettingsManager
from advanced_ui_manager import ThemeManager
from proxy_manager import ProxyManager
from scheduler import Scheduler
from speed_limiter import SpeedLimiter
from auth_manager import AuthManager
from download_core import DownloadItem, DownloadState, download_youtube_task, download_direct_file_task
from http_integration import HTTPIntegration

# ── New PyQt6 UI components ────────────────────────────────────────────────
from ui_components import DownloadListRow, AddDownloadDialog
from database_manager import DatabaseManager

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    filename='loadifypro.log',
    filemode='w'
)


def load_stylesheet():
    qss_path = os.path.join(os.path.dirname(__file__), "styles.qss")
    if os.path.exists(qss_path):
        with open(qss_path, "r") as f:
            return f.read()
    return ""


# ─────────────────────────────────────────────────────────────────────────────
#  Main Window
# ─────────────────────────────────────────────────────────────────────────────
class LodifyProApp(QMainWindow):
    """Main application window — pure UI wrapper around the download engine."""

    def __init__(self):
        super().__init__()
        self.db_manager = DatabaseManager()

        # ── Managers (untouched engine) ──────────────────────────────────────
        self.settings_manager = SettingsManager()
        self.settings = self.settings_manager.settings
        self.translator = LocaleManager(self.settings.get('language', 'en'))
        self.theme_manager = ThemeManager(self.settings_manager)
        self.proxy_manager = ProxyManager()
        self.scheduler = Scheduler()
        self.speed_limiter = SpeedLimiter()
        self.auth_manager = AuthManager()
        self.av_manager = AntivirusManager(update_callback=self._queue_ui_update)
        self.http_integration = HTTPIntegration(self._add_download_from_browser)

        # ── State ────────────────────────────────────────────────────────────
        self.downloads: dict = {}          # id → DownloadItem
        self.ui_elements: dict = {}        # id → DownloadListRow
        self.download_queue = queue.Queue()
        self.ui_queue = queue.Queue()
        self.active_download_threads = []
        self.max_concurrent_downloads = self.settings.get('max_concurrent_downloads', 3)
        self.current_filter = "All Downloads"
        self.nav_buttons = {}
        self.selected_ids = set() # Track selected download IDs
        
        # ── Setup Pages ──────────────────────────────────────────────────────
        self.content_stack = QStackedWidget()

        # ── Apply engine settings ────────────────────────────────────────────
        self._apply_all_settings()

        # ── Window setup ─────────────────────────────────────────────────────
        self.setWindowTitle("LodifyPro 2.0")
        self.setMinimumSize(1100, 700)
        self.resize(1200, 760)

        # ── Build UI ─────────────────────────────────────────────────────────
        self._build_ui()
        self._load_history()

    def _load_history(self):
        """Load download history from database."""
        try:
            history = self.db_manager.get_all_downloads()
            for h in history:
                item = DownloadItem.from_dict(h)
                self.downloads[item.id] = item
                self._create_row(item)
            logging.info(f"MainApp: Loaded {len(history)} items from history.")
            self._update_stats()
            self._update_empty_state()
        except Exception as e:
            logging.error(f"Error loading history: {e}")

        # ── Start services ───────────────────────────────────────────────────
        self.http_integration.start()
        self.scheduler.start()

        # ── UI update timer (replaces tkinter's .after()) ───────────────────
        self._ui_timer = QTimer(self)
        self._ui_timer.timeout.connect(self._process_ui_updates)
        self._ui_timer.start(200)

    # ─────────────────────────────────────────────────────────────────────────
    #  UI Construction
    # ─────────────────────────────────────────────────────────────────────────
    def _build_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        root = QHBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        root.addWidget(self._build_sidebar())
        root.addWidget(self._build_main(), stretch=1)

    # ── Sidebar ───────────────────────────────────────────────────────────────
    def _build_sidebar(self):
        sidebar = QFrame()
        sidebar.setObjectName("sidebar")
        sidebar.setFixedWidth(220)

        layout = QVBoxLayout(sidebar)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Logo
        logo = QLabel("Nexus\nMANAGER")
        logo.setObjectName("logo_label")
        logo.setFont(QFont("Segoe UI", 20, QFont.Weight.Bold))
        logo.setContentsMargins(20, 20, 20, 10)
        layout.addWidget(logo)

        # LIBRARY section
        layout.addWidget(self._section_label("LIBRARY"))
        self.nav_buttons["All Downloads"] = self._nav_btn(layout, "📚  All Downloads", active=True, callback=lambda: self._switch_page(0, "All Downloads"))
        self.nav_buttons["Video"] = self._nav_btn(layout, "📺  Video", callback=lambda: self._switch_page(0, "Video"))
        self.nav_buttons["Music"] = self._nav_btn(layout, "🎵  Music", callback=lambda: self._switch_page(0, "Music"))
        self.nav_buttons["Compressed"] = self._nav_btn(layout, "📦  Compressed", callback=lambda: self._switch_page(0, "Compressed"))
        self.nav_buttons["Documents"] = self._nav_btn(layout, "📄  Documents", callback=lambda: self._switch_page(0, "Documents"))

        # FEATURES section
        layout.addWidget(self._section_label("FEATURES"))
        self.nav_buttons["Scheduler"] = self._nav_btn(layout, "⏰  Scheduler", callback=lambda: self._switch_page(1))
        self.nav_buttons["Browser"] = self._nav_btn(layout, "🌐  Browser Integration", callback=lambda: self._switch_page(2))
        self.nav_buttons["Settings"] = self._nav_btn(layout, "⚙️  Settings", callback=lambda: self._switch_page(3))

        layout.addStretch()

        # Storage widget
        self._setup_status_bar(layout)

        return sidebar

    def _setup_status_bar(self, parent_layout):
        """Storage bar at the bottom left."""
        self.storage_container = QWidget()
        self.storage_container.setObjectName("storage_container")
        layout = QVBoxLayout(self.storage_container)
        layout.setContentsMargins(20, 10, 20, 20)
        layout.setSpacing(8)

        # Header with icon
        header = QHBoxLayout()
        icon = QLabel("📁")
        icon.setFixedWidth(16)
        label = QLabel("Storage")
        label.setObjectName("storage_title")
        header.addWidget(icon)
        header.addWidget(label)
        header.addStretch()
        layout.addLayout(header)

        # Progress bar
        self.storage_bar = QProgressBar()
        self.storage_bar.setObjectName("storage_progress")
        self.storage_bar.setFixedHeight(6) # Changed from setHeight to setFixedHeight
        self.storage_bar.setTextVisible(False)
        layout.addWidget(self.storage_bar)

        # Stats
        self.storage_lbl = QLabel("Calculating...")
        self.storage_lbl.setObjectName("storage_stats")
        layout.addWidget(self.storage_lbl)

        parent_layout.addWidget(self.storage_container)
        
        # Initial storage update
        self._update_storage_stats()

    def _section_label(self, text):
        lbl = QLabel(text)
        lbl.setObjectName("section_label")
        lbl.setFont(QFont("Segoe UI", 10, QFont.Weight.Bold))
        return lbl

    def _nav_btn(self, layout, text, active=False, callback=None):
        btn = QPushButton(text)
        btn.setObjectName("nav_btn")
        btn.setProperty("active", "true" if active else "false")
        btn.setFixedHeight(38)
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        btn.setFont(QFont("Segoe UI", 12))
        if callback:
            btn.clicked.connect(callback)
        layout.addWidget(btn)
        return btn

    # ── Main Content ──────────────────────────────────────────────────────────
    def _build_main(self):
        main = QWidget()
        main.setObjectName("main_content")
        layout = QVBoxLayout(main)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self._setup_top_bar(layout)
        
        # Add Views to Stack
        self.content_stack.addWidget(self._build_download_panel())     # Index 0
        self.content_stack.addWidget(self._build_scheduler_panel())    # Index 1
        self.content_stack.addWidget(self._build_browser_panel())      # Index 2
        self.content_stack.addWidget(self._build_settings_panel())     # Index 3
        
        layout.addWidget(self.content_stack, stretch=1)

        return main

    def _setup_top_bar(self, parent_layout):
        topbar = QFrame()
        topbar.setObjectName("topbar")
        topbar.setFixedHeight(64)

        bar = QHBoxLayout(topbar)
        bar.setContentsMargins(20, 0, 20, 0)
        bar.setSpacing(10)

        # + Add URL button
        self.add_url_btn = QPushButton("  +  Add URL")
        self.add_url_btn.setObjectName("add_btn")
        self.add_url_btn.setFont(QFont("Segoe UI", 13, QFont.Weight.Bold))
        self.add_url_btn.setFixedSize(140, 40)
        self.add_url_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.add_url_btn.clicked.connect(self._open_add_dialog)
        bar.addWidget(self.add_url_btn)

        bar.addSpacing(10)
        
        # Action Group (Play, Pause, Stop, Delete)
        self.toolbar_actions = {}
        actions = [
            ("▶", "Resume selected", self._resume_selected),
            ("⏸", "Pause selected", self._pause_selected),
            ("✖", "Cancel selected", self._cancel_selected),
            ("🗑", "Remove selected", self._remove_selected)
        ]
        
        for icon, tip, callback in actions:
            btn = QPushButton(icon)
            btn.setObjectName("toolbar_btn")
            btn.setToolTip(tip)
            btn.setFixedSize(36, 36)
            btn.setEnabled(False) # Default disabled
            btn.clicked.connect(callback)
            bar.addWidget(btn)
            self.toolbar_actions[icon] = btn

        bar.addStretch()

        # Stats labels
        self.active_lbl = QLabel("Active: 0")
        self.active_lbl.setObjectName("stat_pill")
        self.speed_lbl = QLabel("⬇  0.00 MB/s")
        self.speed_lbl.setObjectName("stat_pill")
        self.completed_lbl = QLabel("Done: 0")
        self.completed_lbl.setObjectName("stat_pill")
        for lbl in [self.active_lbl, self.speed_lbl, self.completed_lbl]:
            bar.addWidget(lbl)

        bar.addSpacing(20)

        # Search bar
        self.search_bar = QLineEdit()
        self.search_bar.setObjectName("search_bar")
        self.search_bar.setPlaceholderText("🔍  Search downloads...")
        self.search_bar.setFixedSize(230, 38)
        bar.addWidget(self.search_bar)
        
        parent_layout.addWidget(topbar)

    def _build_download_panel(self):
        panel = QFrame()
        panel.setObjectName("downloads_panel")

        outer = QVBoxLayout(panel)
        outer.setContentsMargins(16, 12, 16, 16)
        outer.setSpacing(8)

        # ── Table Header ───────────────────────────────────────────────────
        header_widget = QFrame() # Wrap in QFrame to apply style
        header_widget.setObjectName("list_header")
        header_widget.setFixedHeight(36)
        h_layout = QHBoxLayout(header_widget)
        h_layout.setContentsMargins(15, 5, 15, 5) # Match row margins
        h_layout.setSpacing(10)
        
        # Adjusted spacing: 20 (checkbox) + 10 (spacing) + 10 (extra padding)
        h_layout.addSpacing(40) 
        
        cols = [
            ("FILE NAME", 0), ("SIZE", 120), ("STATUS", 100), 
            ("SPEED", 100), ("ETA", 100), ("ACTIONS", 100)
        ]
        
        for text, fixed_width in cols:
            lbl = QLabel(text)
            lbl.setObjectName("header_label")
            lbl.setFont(QFont("Segoe UI", 10, QFont.Weight.Bold))
            if fixed_width == 0: # Use 0 for expanding column
                lbl.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
            else:
                widths = {"SIZE": 130, "STATUS": 100, "SPEED": 90, "ETA": 70, "ACTIONS": 90}
                lbl.setFixedWidth(widths.get(text, 90))
                lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            h_layout.addWidget(lbl)

        outer.addWidget(header_widget)

        # Scroll area
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setFrameShape(QFrame.Shape.NoFrame)

        self._list_widget = QWidget()
        self._list_widget.setObjectName("main_content")
        self._list_layout = QVBoxLayout(self._list_widget)
        self._list_layout.setContentsMargins(0, 4, 0, 4)
        self._list_layout.setSpacing(3)
        self._list_layout.setAlignment(Qt.AlignmentFlag.AlignTop)

        # Empty state
        self._empty_state = QLabel("📥\n\nNo downloads yet\nClick '+  Add URL' to get started")
        self._empty_state.setObjectName("empty_text")
        self._empty_state.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._empty_state.setFont(QFont("Segoe UI", 14))
        self._list_layout.addWidget(self._empty_state)

        scroll.setWidget(self._list_widget)
        outer.addWidget(scroll)

        return panel

    # ─────────────────────────────────────────────────────────────────────────
    #  Download Actions (same logic, new UI hookups)
    # ─────────────────────────────────────────────────────────────────────────
    def _open_add_dialog(self):
        dialog = AddDownloadDialog(self, self.translator, self._process_add_download)
        dialog.exec()

    def _process_add_download(self, url, dest, quality):
        try:
            item = DownloadItem(url, dest)
            item.quality = quality
            
            # Save to Database
            self.db_manager.save_download({
                'id': item.id, 'url': item.url, 'destination': item.destination,
                'filename': item.filename, 'filepath': item.filepath,
                'state': item.state, 'progress': item.progress,
                'total_size': item.total_size, 'downloaded_size': item.downloaded_size,
                'quality': item.quality, 'is_youtube': item.is_youtube,
                'error_message': item.error_message
            })
            
            self.downloads[item.id] = item
            self._create_row(item)
            self.download_queue.put(item.id)
            self._process_queue()
            logging.info(f"MainApp: Download {item.id} added and saved to DB")
        except Exception as e:
            logging.error(f"Error adding download: {e}")
            QMessageBox.critical(self, "Error", f"Failed to add download:\n{str(e)}")

    def _on_row_selected(self, item_id, checked):
        if checked:
            self.selected_ids.add(item_id)
        else:
            self.selected_ids.discard(item_id)
        self._update_toolbar_state()

    def _update_toolbar_state(self):
        has_selection = len(self.selected_ids) > 0
        for btn in self.toolbar_actions.values():
            btn.setEnabled(has_selection)

    def _update_storage_stats(self):
        try:
            import shutil
            # Monitor the drive where the downloads are saved
            download_path = self.settings.get('download_path', os.path.expanduser("~/Downloads"))
            drive = os.path.splitdrive(download_path)[0] or "C:"
            usage = shutil.disk_usage(drive)
            
            used_gb = usage.used / (1024**3)
            total_gb = usage.total / (1024**3)
            percent = (usage.used / usage.total) * 100
            
            self.storage_bar.setValue(int(percent))
            self.storage_lbl.setText(f"{used_gb:.1f} GB Used / {total_gb:.1f} GB Total")
        except Exception as e:
            logging.error(f"Failed to update storage stats: {e}")

    def _create_row(self, item):
        self._empty_state.hide()
        callbacks = {
            'cancel_download': self.cancel_download,
            'pause_download': self.pause_download,
            'resume_download': self.resume_download,
            'refresh_download_link': self.refresh_download_link,
            'get_translator': lambda: self.translator,
            'on_select': lambda checked: self._on_row_selected(item.id, checked)
        }
        row = DownloadListRow(self._list_widget, item, callbacks)
        self.ui_elements[item.id] = row
        
        # Respect current filter
        if not self._matches_filter(item):
            row.hide()
            
        self._list_layout.insertWidget(0, row)  # newest on top

    def _process_queue(self):
        self.active_download_threads = [t for t in self.active_download_threads if t.is_alive()]
        while (not self.download_queue.empty()
               and len(self.active_download_threads) < self.max_concurrent_downloads):
            item_id = self.download_queue.get()
            item = self.downloads.get(item_id)
            if not item:
                continue
            self._queue_ui_update(item_id, {'state': DownloadState.DOWNLOADING})
            target = download_youtube_task if item.is_youtube else download_direct_file_task
            args = (item, self._queue_ui_update, self._download_finished, {
                'proxy': self.proxy_manager,
                'auth': self.auth_manager,
                'speed_limiter': self.speed_limiter
            })
            thread = threading.Thread(target=target, args=args, daemon=True)
            self.active_download_threads.append(thread)
            thread.start()

    # ─────────────────────────────────────────────────────────────────────────
    #  UI Updates (thread-safe via queue → QTimer)
    # ─────────────────────────────────────────────────────────────────────────
    def _queue_ui_update(self, item_id: str, update_dict: dict):
        self.ui_queue.put((item_id, update_dict))

    def _process_ui_updates(self):
        try:
            while True:
                item_id, update_dict = self.ui_queue.get_nowait()
                
                # Handle browser download injection
                if item_id == "__browser__":
                    url = update_dict.get('__browser_url__', '')
                    quality = update_dict.get('__quality__', 'best')
                    if url:
                        # Use set destination or fallback to system Downloads
                        dest = self.settings.get('download_path', os.path.join(os.path.expanduser("~"), "Downloads"))
                        self._process_add_download(url, dest, quality)
                    self.ui_queue.task_done()
                    continue

                item = self.downloads.get(item_id)
                if item and item_id in self.ui_elements:
                    for k, v in update_dict.items():
                        setattr(item, k, v)
                    
                    # Sync to Database
                    if 'state' in update_dict or 'error_message' in update_dict:
                        self.db_manager.update_state(item_id, item.state, item.error_message)
                    elif 'progress' in update_dict:
                        self.db_manager.update_progress(item_id, item.progress, item.downloaded_size, item.total_size)
                        
                    # Update visibility if needed
                    row = self.ui_elements[item_id]
                    if self._matches_filter(item):
                        row.show()
                    else:
                        row.hide()
                        
                    row.update_ui(item)
                self.ui_queue.task_done()
        except queue.Empty:
            pass
        self._update_stats()
        self._update_empty_state()

    def _update_empty_state(self):
        visible_rows = [row for row in self.ui_elements.values() if not row.isHidden()]
        if not visible_rows:
            self._empty_state.show()
        else:
            self._empty_state.hide()

    def _set_filter(self, filter_name):
        self.current_filter = filter_name
        # Update sidebar buttons
        for name, btn in self.nav_buttons.items():
            btn.setProperty("active", "true" if name == filter_name else "false")
            btn.setStyle(btn.style()) # Refresh style
            
        # Update specific rows visibility
        for item_id, item in self.downloads.items():
            if item_id in self.ui_elements:
                row = self.ui_elements[item_id]
                if self._matches_filter(item):
                    row.show()
                else:
                    row.hide()
        
        self._update_empty_state()

    def _matches_filter(self, item):
        if self.current_filter == "All Downloads":
            return True
        
        ext = os.path.splitext(item.filename)[1].lower()
        if self.current_filter == "Video":
            return item.is_youtube or ext in ['.mp4', '.mkv', '.avi', '.mov', '.webm']
        if self.current_filter == "Music" and not item.is_youtube:
            return ext in ['.mp3', '.wav', '.flac', '.m4a', '.aac']
        if self.current_filter == "Compressed":
            return ext in ['.zip', '.rar', '.7z', '.tar', '.gz']
        if self.current_filter == "Documents":
            return ext in ['.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx']
        return False

    def _update_stats(self):
        active = [i for i in self.downloads.values() if i.state == DownloadState.DOWNLOADING]
        done = [i for i in self.downloads.values() if i.state == DownloadState.COMPLETED]
        total_speed = sum(i.speed for i in active)
        self.active_lbl.setText(f"Active: {len(active)}")
        self.completed_lbl.setText(f"Done: {len(done)}")
        self.speed_lbl.setText(f"⬇  {total_speed:.2f} MB/s" if total_speed > 0 else "⬇  0.00 MB/s")
        
        # Update storage periodically (every ~10 seconds)
        if not hasattr(self, '_storage_tick'): self._storage_tick = 0
        self._storage_tick += 1
        if self._storage_tick >= 10:
            self._update_storage_stats()
            self._storage_tick = 0

    # ─────────────────────────────────────────────────────────────────────────
    #  Browser Extension Hook (unchanged from previous version)
    # ─────────────────────────────────────────────────────────────────────────
    def _add_download_from_browser(self, url, quality='best'):
        """Called by HTTPIntegration — must be thread-safe."""
        self._queue_ui_update("__browser__", {'__browser_url__': url, '__quality__': quality})

    def _switch_page(self, index, filter_name=None):
        self.content_stack.setCurrentIndex(index)
        
        # Update sidebar active state
        for name, btn in self.nav_buttons.items():
            is_active = False
            if index == 0 and name == filter_name: is_active = True
            elif index == 1 and name == "Scheduler": is_active = True
            elif index == 2 and name == "Browser": is_active = True
            elif index == 3 and name == "Settings": is_active = True
            
            btn.setProperty("active", "true" if is_active else "false")
            btn.setStyle(btn.style())

        if filter_name:
            self._set_filter(filter_name)

    def _build_scheduler_panel(self):
        panel = QFrame()
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(40, 40, 40, 40)
        
        title = QLabel("⏰ Scheduler")
        title.setStyleSheet("font-size: 24px; font-weight: bold; color: white;")
        layout.addWidget(title)
        
        info = QLabel("Automate your downloads. Set start/stop times for off-peak hours.")
        info.setStyleSheet("color: #a0aab5; font-size: 14px;")
        layout.addWidget(info)
        layout.addSpacing(30)
        
        # Mock settings
        layout.addWidget(QLabel("Current status: INACTIVE", styleSheet="color: #6a727a;"))
        layout.addStretch()
        return panel

    def _build_browser_panel(self):
        panel = QFrame()
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(40, 40, 40, 40)
        
        title = QLabel("🌐 Browser Integration")
        title.setStyleSheet("font-size: 24px; font-weight: bold; color: white;")
        layout.addWidget(title)
        
        info = QLabel("LodifyPro Extension is connected and listening on port 8080.")
        info.setStyleSheet("color: #2ecc71; font-size: 14px;")
        layout.addWidget(info)
        layout.addStretch()
        return panel

    def _build_settings_panel(self):
        panel = QFrame()
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(40, 40, 40, 40)
        
        title = QLabel("⚙️ Application Settings")
        title.setStyleSheet("font-size: 24px; font-weight: bold; color: white;")
        layout.addWidget(title)
        
        # Add basic settings form
        form = QGridLayout()
        form.setSpacing(15)
        
        form.addWidget(QLabel("Download Folder:"), 0, 0)
        path = QLineEdit(self.settings.get('download_path', ''))
        path.setReadOnly(True)
        form.addWidget(path, 0, 1)
        
        form.addWidget(QLabel("Max Concurrent:"), 1, 0)
        spin = QSpinBox()
        spin.setValue(self.max_concurrent_downloads)
        form.addWidget(spin, 1, 1)
        
        layout.addLayout(form)
        layout.addStretch()
        return panel


    # ─────────────────────────────────────────────────────────────────────────
    #  Download Controls (connected to DownloadListRow buttons)
    # ─────────────────────────────────────────────────────────────────────────
    def _resume_selected(self):
        for id in list(self.selected_ids):
            if id in self.downloads:
                self.resume_download(id) # Call the existing resume_download
        self.selected_ids.clear()
        self._update_toolbar_state()

    def _pause_selected(self):
        for id in list(self.selected_ids):
            if id in self.downloads:
                self.pause_download(id) # Call the existing pause_download
        self.selected_ids.clear()
        self._update_toolbar_state()

    def _cancel_selected(self):
        for id in list(self.selected_ids):
            if id in self.downloads:
                self.cancel_download(id) # Call the existing cancel_download
        self.selected_ids.clear()
        self._update_toolbar_state()

    def _remove_selected(self):
        for id in list(self.selected_ids):
            if id in self.downloads:
                self.cancel_download(id) # Ensure stopped
                self.db_manager.delete_download(id) # Remove from history
                if id in self.ui_elements:
                    row = self.ui_elements.pop(id)
                    row.setParent(None)
                    row.deleteLater()
                self.downloads.pop(id, None)
        self.selected_ids.clear()
        self._update_toolbar_state()
        self._update_empty_state()

    def pause_download(self, item_id):
        if item := self.downloads.get(item_id):
            item.pause()
            if item_id in self.ui_elements:
                self.ui_elements[item_id].update_ui(item)

    def resume_download(self, item_id):
        if item := self.downloads.get(item_id):
            item.resume()
            if item_id in self.ui_elements:
                self.ui_elements[item_id].update_ui(item)
            self.download_queue.put(item_id)
            self._process_queue()

    def cancel_download(self, item_id):
        if item := self.downloads.get(item_id):
            item.cancel()
            if item_id in self.ui_elements:
                self.ui_elements[item_id].update_ui(item)

    def refresh_download_link(self, item_id):
        if item := self.downloads.get(item_id):
            item.resume()
            self.download_queue.put(item_id)
            self._process_queue()

    def _download_finished(self, item_id):
        item = self.downloads.get(item_id)
        if item and item.state == DownloadState.COMPLETED:
            self.av_manager.scan_file_async(item.filepath, item.id)
        self._process_queue()

    # ─────────────────────────────────────────────────────────────────────────
    #  Settings
    # ─────────────────────────────────────────────────────────────────────────
    def _open_settings(self):
        QMessageBox.information(self, "Settings", "Settings window coming in the next polish pass!")

    def save_and_apply_settings(self, new_settings: dict):
        self.settings_manager.settings.update(new_settings)
        self.settings_manager.save_settings()
        self.translator.set_language(new_settings.get('language', 'en'))
        self._apply_all_settings()

    def _apply_all_settings(self):
        s = self.settings_manager.settings
        self.proxy_manager.configure(
            s.get('proxy_enabled', False),
            s.get('proxy_http', ''),
            s.get('proxy_https', '')
        )
        self.speed_limiter.configure(
            s.get('speed_limit_enabled', False),
            s.get('speed_limit_kb', 1024)
        )
        self.auth_manager.configure(
            s.get('auth_enabled', False),
            s.get('auth_user', ''),
            s.get('auth_pass', '')
        )
        self.av_manager.configs = s.get('av_configs', {})
        self.av_manager.active_config_name = s.get('av_active_config')
        self.max_concurrent_downloads = s.get('max_concurrent_downloads', 3)

    # ─────────────────────────────────────────────────────────────────────────
    #  Window Close
    # ─────────────────────────────────────────────────────────────────────────
    def closeEvent(self, event):
        self._ui_timer.stop()
        self.scheduler.stop()
        event.accept()


# ─────────────────────────────────────────────────────────────────────────────
#  Entry Point
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyleSheet(load_stylesheet())
    app.setFont(QFont("Segoe UI", 11))

    window = LodifyProApp()
    window.show()
    sys.exit(app.exec())
