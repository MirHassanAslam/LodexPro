"""
LodifyPro 2.0 - UI Components (PyQt6)
DownloadListRow, AddDownloadDialog, SettingsWindow
All download logic callbacks are unchanged.
"""
from PyQt6.QtWidgets import (
    QWidget, QHBoxLayout, QVBoxLayout, QLabel, QPushButton,
    QProgressBar, QCheckBox, QSizePolicy, QDialog, QLineEdit,
    QComboBox, QFileDialog, QMessageBox, QFrame, QScrollArea,
    QTabWidget, QSpinBox, QApplication, QGraphicsOpacityEffect
)
from PyQt6.QtCore import (
    Qt, QPropertyAnimation, QEasingCurve, QRect, QSize,
    QSequentialAnimationGroup, QTimer, QPoint
)
from PyQt6.QtGui import QFont, QIcon, QColor
import os

from download_core import DownloadState
from antivirus_manager import ScanStatus


# ─────────────────────────────────────────────────
#  DownloadListRow
# ─────────────────────────────────────────────────
class DownloadListRow(QFrame):
    """A single animated row in the download list."""

    def __init__(self, parent, item, callbacks):
        super().__init__(parent)
        self.item = item
        self.callbacks = callbacks
        self.translator = callbacks['get_translator']()
        self.setObjectName("download_row")
        self.setFixedHeight(54)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

        self._build_ui()
        self.update_ui(item)
        self._animate_in()

    # ── Build ──────────────────────────────────────────────────────────────
    def _build_ui(self):
        # Main layout (Horizontal)
        self._main_layout = QHBoxLayout(self)
        self._main_layout.setContentsMargins(15, 0, 15, 0)
        self._main_layout.setSpacing(10)

        # 1. Checkbox and spacing
        self.checkbox = QCheckBox()
        self.checkbox.setFixedWidth(20)
        self.checkbox.stateChanged.connect(lambda state: self.callbacks['on_select'](state == 2))
        self._main_layout.addWidget(self.checkbox)
        
        self._main_layout.addSpacing(10) # Minimal spacing without cluttered icons

        # Name + progress col
        name_col = QVBoxLayout()
        name_col.setSpacing(3)
        name_col.setContentsMargins(0, 0, 0, 0)

        self.name_lbl = QLabel(self._truncate(self.item.filename))
        self.name_lbl.setObjectName("filename_label")
        name_col.addWidget(self.name_lbl)

        self.progress_bar = QProgressBar()
        self.progress_bar.setObjectName("row_progress")
        self.progress_bar.setTextVisible(False)
        self.progress_bar.setFixedHeight(4)
        self.progress_bar.setRange(0, 100)
        name_col.addWidget(self.progress_bar)

        self._main_layout.addLayout(name_col, stretch=4)

        # Size
        self.size_lbl = QLabel("—")
        self.size_lbl.setObjectName("meta_label")
        self.size_lbl.setFixedWidth(130)
        self.size_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._main_layout.addWidget(self.size_lbl)

        # Status
        self.status_lbl = QLabel("Queued")
        self.status_lbl.setObjectName("status_queued")
        self.status_lbl.setFixedWidth(100)
        self.status_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._main_layout.addWidget(self.status_lbl)

        # Speed
        self.speed_lbl = QLabel("—")
        self.speed_lbl.setObjectName("meta_label")
        self.speed_lbl.setFixedWidth(90)
        self.speed_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._main_layout.addWidget(self.speed_lbl)

        # ETA
        self.eta_lbl = QLabel("—")
        self.eta_lbl.setObjectName("meta_label")
        self.eta_lbl.setFixedWidth(70)
        self.eta_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._main_layout.addWidget(self.eta_lbl)

        # Action Buttons
        self.pause_btn = self._action_btn("⏸", "pause")
        self.resume_btn = self._action_btn("▶", "resume")
        self.cancel_btn = self._action_btn("╳", "cancel")
        self.folder_btn = self._action_btn("📁", "folder")

        self.pause_btn.clicked.connect(self._on_pause)
        self.resume_btn.clicked.connect(self._on_resume)
        self.cancel_btn.clicked.connect(self._on_cancel)
        self.folder_btn.clicked.connect(self._open_folder)

        for btn in [self.pause_btn, self.resume_btn, self.cancel_btn, self.folder_btn]:
            self._main_layout.addWidget(btn)

    def _action_btn(self, text, btn_type):
        btn = QPushButton(text)
        btn.setObjectName("row_action_btn")
        btn.setProperty("type", btn_type)
        btn.setFixedSize(28, 28)
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        return btn

    # ── Fade-in animation ──────────────────────────────────────────────────
    def _animate_in(self):
        self._opacity = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(self._opacity)
        self._anim = QPropertyAnimation(self._opacity, b"opacity")
        self._anim.setDuration(350)
        self._anim.setStartValue(0.0)
        self._anim.setEndValue(1.0)
        self._anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        self._anim.start()

    # ── Update ─────────────────────────────────────────────────────────────
    def update_ui(self, item):
        self.item = item
        self.name_lbl.setText(self._truncate(item.filename))
        self.progress_bar.setValue(int(item.progress))

        size_str = f"{self._fmt(item.downloaded_size)} / {self._fmt(item.total_size)}"
        self.size_lbl.setText(size_str)

        state = item.state
        if state == DownloadState.DOWNLOADING:
            self.status_lbl.setText(f"{item.progress:.1f}%")
            self.status_lbl.setObjectName("status_downloading")
            self.speed_lbl.setText(f"{item.speed:.2f} MB/s" if item.speed else "—")
            self.eta_lbl.setText(str(item.time_remaining) if item.time_remaining else "—")
            self.progress_bar.setProperty("status", "downloading")
        elif state == DownloadState.PAUSED:
            self.status_lbl.setText("Paused")
            self.status_lbl.setObjectName("status_paused")
            self.progress_bar.setProperty("status", "paused")
            self.speed_lbl.setText("—")
            self.eta_lbl.setText("—")
        elif state == DownloadState.COMPLETED:
            self.status_lbl.setText("Done ✓")
            self.status_lbl.setObjectName("status_completed")
            self.progress_bar.setValue(100)
            self.progress_bar.setProperty("status", "completed")
            self.speed_lbl.setText("—")
            self.eta_lbl.setText("—")
        elif state == DownloadState.ERROR:
            self.status_lbl.setText("Error")
            self.status_lbl.setObjectName("status_error")
            self.progress_bar.setProperty("status", "error")
        elif state == DownloadState.QUEUED:
            self.status_lbl.setText("Queued")
            self.status_lbl.setObjectName("status_queued")
        else:
            self.status_lbl.setText("Cancelled")
            self.status_lbl.setObjectName("status_cancelled")

        # Re-apply stylesheet so objectName changes take effect
        self.status_lbl.setStyle(self.status_lbl.style())
        self.progress_bar.setStyle(self.progress_bar.style())

        self._update_buttons(state)

    def _update_buttons(self, state):
        self.pause_btn.hide()
        self.resume_btn.hide()
        self.cancel_btn.hide()
        self.folder_btn.hide()

        if state == DownloadState.DOWNLOADING:
            self.pause_btn.show()
            self.cancel_btn.show()
        elif state == DownloadState.PAUSED:
            self.resume_btn.show()
            self.cancel_btn.show()
        elif state == DownloadState.QUEUED:
            self.cancel_btn.show()
        elif state == DownloadState.ERROR:
            self.resume_btn.show()
            self.cancel_btn.show()
        else:  # COMPLETED / CANCELLED
            self.folder_btn.show()

    # ── Callbacks ──────────────────────────────────────────────────────────
    def _on_pause(self):
        if cb := self.callbacks.get('pause_download'):
            cb(self.item.id)

    def _on_resume(self):
        if cb := self.callbacks.get('resume_download'):
            cb(self.item.id)

    def _on_cancel(self):
        if cb := self.callbacks.get('cancel_download'):
            cb(self.item.id)

    def _open_folder(self):
        import subprocess, platform
        folder = os.path.dirname(self.item.filepath)
        if os.path.exists(folder):
            if platform.system() == "Windows":
                subprocess.run(["explorer", folder])
            elif platform.system() == "Darwin":
                subprocess.run(["open", folder])
            else:
                subprocess.run(["xdg-open", folder])

    # ── Helpers ────────────────────────────────────────────────────────────
    def _truncate(self, name, max_len=65):
        if len(name) <= max_len:
            return name
        return name[:max_len // 2] + "…" + name[-max_len // 2:]

    def _fmt(self, b):
        if isinstance(b, (int, float)) and b > 0:
            return f"{b / 1024 ** 2:.2f} MB"
        return "0 MB"


# ─────────────────────────────────────────────────
#  AddDownloadDialog
# ─────────────────────────────────────────────────
class AddDownloadDialog(QDialog):
    """Pop-in animated modal for adding a new download."""

    def __init__(self, parent, translator, submit_callback):
        super().__init__(parent)
        self.translator = translator
        self.submit_callback = submit_callback

        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Dialog)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setModal(True)
        self.setFixedSize(520, 360)

        self._build_ui()
        self._animate_in()

    def _build_ui(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(20, 20, 20, 20)

        container = QFrame()
        container.setObjectName("add_dialog_container")
        outer.addWidget(container)

        layout = QVBoxLayout(container)
        layout.setContentsMargins(28, 28, 28, 28)
        layout.setSpacing(16)

        # Title
        title = QLabel("Add New Download")
        title.setObjectName("dialog_title")
        title.setFont(QFont("Segoe UI", 16, QFont.Weight.Bold))
        layout.addWidget(title)

        # URL
        layout.addWidget(self._field_label("URL"))
        self.url_input = QLineEdit()
        self.url_input.setObjectName("dialog_input")
        self.url_input.setPlaceholderText("https://youtube.com/watch?v=... or direct file URL")
        self.url_input.setFixedHeight(40)
        layout.addWidget(self.url_input)

        # Destination row
        layout.addWidget(self._field_label("Save To"))
        dest_row = QHBoxLayout()
        self.dest_input = QLineEdit()
        self.dest_input.setObjectName("dialog_input")
        self.dest_input.setFixedHeight(40)
        self.dest_input.setText(os.path.join(os.path.expanduser("~"), "Downloads"))
        dest_row.addWidget(self.dest_input)
        browse_btn = QPushButton("Browse")
        browse_btn.setObjectName("dialog_cancel_btn")
        browse_btn.setFixedSize(80, 40)
        browse_btn.clicked.connect(self._browse)
        dest_row.addWidget(browse_btn)
        layout.addLayout(dest_row)

        # Quality row
        qual_row = QHBoxLayout()
        qual_row.addWidget(self._field_label("Quality"))
        qual_row.addStretch()
        self.quality_combo = QComboBox()
        self.quality_combo.setObjectName("dialog_quality")
        self.quality_combo.addItems(["best", "2160p (4K)", "1080p", "720p", "480p", "360p", "Audio (MP3)", "Audio (M4A)"])
        self.quality_combo.setFixedWidth(200)
        qual_row.addWidget(self.quality_combo)
        layout.addLayout(qual_row)

        layout.addStretch()

        # Buttons
        btn_row = QHBoxLayout()
        btn_row.setSpacing(12)
        cancel_btn = QPushButton("Cancel")
        cancel_btn.setObjectName("dialog_cancel_btn")
        cancel_btn.setFixedHeight(40)
        cancel_btn.clicked.connect(self._animate_out)
        download_btn = QPushButton("  ↓  Download")
        download_btn.setObjectName("dialog_submit_btn")
        download_btn.setFixedHeight(40)
        download_btn.clicked.connect(self._submit)
        btn_row.addWidget(cancel_btn)
        btn_row.addWidget(download_btn)
        layout.addLayout(btn_row)

        self.url_input.setFocus()

    def _field_label(self, text):
        lbl = QLabel(text)
        lbl.setObjectName("dialog_field_label")
        lbl.setFont(QFont("Segoe UI", 11))
        return lbl

    def _browse(self):
        folder = QFileDialog.getExistingDirectory(self, "Select Save Folder")
        if folder:
            self.dest_input.setText(folder)

    def _submit(self):
        url = self.url_input.text().strip()
        dest = self.dest_input.text().strip()
        if not url or not dest:
            QMessageBox.warning(self, "Error", "URL and Destination are required.")
            return
        quality_map = {
            "best": "best", "2160p (4K)": "2160p", "1080p": "1080p",
            "720p": "720p", "480p": "480p", "360p": "360p",
            "Audio (MP3)": "audio", "Audio (M4A)": "audio_m4a"
        }
        quality = quality_map.get(self.quality_combo.currentText(), "best")
        self.submit_callback(url, dest, quality)
        self._animate_out()

    # ── Pop-in animation ───────────────────────────────────────────────────
    def _animate_in(self):
        self._opacity_effect = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(self._opacity_effect)
        anim = QPropertyAnimation(self._opacity_effect, b"opacity")
        anim.setDuration(220)
        anim.setStartValue(0.0)
        anim.setEndValue(1.0)
        anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        anim.start(QPropertyAnimation.DeletionPolicy.DeleteWhenStopped)

    def _animate_out(self):
        anim = QPropertyAnimation(self._opacity_effect, b"opacity")
        anim.setDuration(180)
        anim.setStartValue(1.0)
        anim.setEndValue(0.0)
        anim.setEasingCurve(QEasingCurve.Type.InCubic)
        anim.finished.connect(self.close)
        anim.start(QPropertyAnimation.DeletionPolicy.DeleteWhenStopped)

    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Return or event.key() == Qt.Key.Key_Enter:
            self._submit()
        elif event.key() == Qt.Key.Key_Escape:
            self._animate_out()
        else:
            super().keyPressEvent(event)