"""
Drag & Drop Manager for LoadifyPro
Encapsulates all logic for handling drag-and-drop functionality using tkinterdnd2,
making the main application cleaner and more modular.
"""
import logging
from tkinterdnd2 import DND_FILES

logger = logging.getLogger(__name__)

class DragDropManager:
    """Manages the registration and handling of drag-and-drop events for a root window."""

    def __init__(self, root, url_entry_widget):
        """
        Initializes the DragDropManager.

        Args:
            root: The main Tkinter/customtkinter root window that will be the drop target.
            url_entry_widget: The customtkinter entry widget to populate with the dropped URL.
        """
        self.root = root
        self.url_entry = url_entry_widget

    def enable_drag_drop(self):
        """
        Activates drag-and-drop functionality on the root window. This method
        registers the window as a drop target and binds the drop event to the handler.
        """
        try:
            self.root.drop_target_register(DND_FILES)
            self.root.dnd_bind('<<Drop>>', self._handle_drop_event)
            logger.info("Drag and Drop functionality has been successfully enabled.")
        except Exception as e:
            logger.error(f"Failed to initialize Drag and Drop: {e}. Is tkinterdnd2-universal installed?")

    def _handle_drop_event(self, event):
        """
        Callback that processes the dropped data. It intelligently cleans the data
        and inserts the first valid URL into the target URL entry widget.
        """
        try:
            raw_data = event.data.strip()
            
            # Clean data: Windows often wraps file paths in curly braces.
            if raw_data.startswith('{') and raw_data.endswith('}'):
                raw_data = raw_data[1:-1]
            
            # Extract the first potential URL and remove quotes.
            url = raw_data.split()[0].strip('"')

            if url.startswith(("http://", "https://")):
                self.url_entry.delete(0, 'end')
                self.url_entry.insert(0, url)
                self.root.focus_force()  # Bring the window to the front for better UX.
                logger.info(f"Accepted dropped URL via drag-and-drop: {url}")
            else:
                logger.warning(f"Ignored dropped item (not a valid HTTP/S URL): {url}")
        except Exception as e:
            logger.error(f"An unexpected error occurred while handling drop event: {e}")