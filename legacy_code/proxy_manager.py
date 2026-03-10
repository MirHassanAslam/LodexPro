"""
Proxy Manager for LoadifyPro
Handles the configuration and application of proxy settings for download requests.
"""
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

class ProxyManager:
    """Manages proxy configurations for all network requests made by the application."""

    def __init__(self):
        """Initializes the ProxyManager with default empty settings."""
        self.proxy_settings: Dict[str, Optional[str]] = {"http": None, "https": None}
        self.is_enabled = False
        logger.info("ProxyManager initialized.")

    def configure(self, is_enabled: bool, http_proxy: str, https_proxy: str):
        """
        Configures and enables or disables the proxy settings.

        Args:
            is_enabled (bool): Whether the proxy should be active.
            http_proxy (str): The URL for the HTTP proxy (e.g., 'http://user:pass@host:port').
            https_proxy (str): The URL for the HTTPS proxy. If blank, defaults to the HTTP proxy.
        """
        self.proxy_settings["http"] = http_proxy if http_proxy else None
        self.proxy_settings["https"] = https_proxy if https_proxy else http_proxy
        self.is_enabled = is_enabled

        if self.is_enabled and any(self.proxy_settings.values()):
            logger.info(f"Proxy is ENABLED. HTTP='{self.proxy_settings['http']}', HTTPS='{self.proxy_settings['https']}'")
        else:
            self.is_enabled = False # Ensure it's disabled if no URL is provided
            logger.info("Proxy is DISABLED.")

    def get_proxies(self) -> Optional[Dict[str, str]]:
        """
        Returns the proxy dictionary for the 'requests' library if enabled.

        Returns:
            A dictionary of proxy settings or None if disabled/unconfigured.
        """
        if self.is_enabled and any(self.proxy_settings.values()):
            return {k: v for k, v in self.proxy_settings.items() if v}
        return None