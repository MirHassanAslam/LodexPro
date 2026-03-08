"""
Advanced UI Manager for LodifyPro (PyQt6 compatible stub)
ThemeManager now applies Qt dark theme — no customtkinter dependency.
"""
import logging

logger = logging.getLogger(__name__)


class ThemeManager:
    """Manages the application's visual theme (PyQt6 version — no customtkinter)."""

    def __init__(self, settings_manager):
        self.settings_manager = settings_manager

    def apply_theme(self):
        """Log the theme settings — actual styling is handled by styles.qss."""
        try:
            appearance_mode = self.settings_manager.settings.get('appearance_mode', 'Dark')
            color_theme = self.settings_manager.settings.get('color_theme', 'blue')
            logger.info(f"Theme applied: Appearance='{appearance_mode}', Color='{color_theme}'")
        except Exception as e:
            logger.error(f"Failed to read theme settings: {e}")

    def get_theme_options(self) -> dict:
        return {
            "appearance_modes": ["Dark"],
            "color_themes": ["blue"]
        }