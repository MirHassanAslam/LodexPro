"""
Settings Manager for LoadifyPro
Handles loading and saving of user preferences from a JSON file.
"""
import json
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class SettingsManager:
    """Manages loading and saving application settings to/from a JSON file."""

    def __init__(self, settings_file: str = 'settings.json'):
        self.settings_file = settings_file
        self.defaults: Dict[str, Any] = {
            'language': 'en',
            'appearance_mode': 'Dark',
            'color_theme': 'blue',
            'proxy_enabled': False,
            'proxy_http': '',
            'proxy_https': '',
            'speed_limit_enabled': False,
            'speed_limit_kb': 1024,
            'auth_enabled': False,
            'auth_user': '',
            'auth_pass': '',
            'av_configs': {},
            'av_active_config': None
        }
        self.settings = self._load_settings()

    def _load_settings(self) -> Dict[str, Any]:
        current_settings = self.defaults.copy()
        try:
            with open(self.settings_file, 'r') as f:
                loaded_settings = json.load(f)
                current_settings.update(loaded_settings)
        except (FileNotFoundError, json.JSONDecodeError):
            logger.info("Settings file not found or corrupt, using defaults.")
        return current_settings

    def save_settings(self):
        try:
            with open(self.settings_file, 'w') as f:
                json.dump(self.settings, f, indent=4)
            logger.info(f"Settings successfully saved to {self.settings_file}.")
        except IOError as e:
            logger.error(f"Failed to save settings to {self.settings_file}: {e}")