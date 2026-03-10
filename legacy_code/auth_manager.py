"""
Authentication Manager for LoadifyPro
Handles credentials for downloads requiring HTTP Basic or Digest authentication.
"""
import logging
from typing import Optional, Tuple
from requests.auth import HTTPBasicAuth, HTTPDigestAuth

logger = logging.getLogger(__name__)

class AuthManager:
    """Manages authentication credentials for HTTP requests."""

    def __init__(self):
        """Initializes the AuthManager."""
        self.credentials: Optional[Tuple[str, str]] = None
        self.is_enabled = False
        logger.info("AuthManager initialized.")

    def configure(self, is_enabled: bool, username: str, password: str):
        """
        Configures and enables or disables authentication.

        Args:
            is_enabled (bool): Whether authentication should be active.
            username (str): The username for authentication.
            password (str): The password for authentication.
        """
        self.is_enabled = is_enabled
        if self.is_enabled and username:
            self.credentials = (username, password)
            logger.info(f"Authentication ENABLED for user '{username}'.")
        else:
            self.is_enabled = False
            self.credentials = None
            logger.info("Authentication DISABLED.")

    def get_auth(self, auth_type: str = 'basic') -> Optional[object]:
        """
        Returns a requests.auth object if authentication is enabled and configured.

        Args:
            auth_type (str): The type of authentication ('basic' or 'digest').

        Returns:
            A requests.auth object or None.
        """
        if not self.is_enabled or not self.credentials:
            return None

        username, password = self.credentials
        if auth_type.lower() == 'digest':
            return HTTPDigestAuth(username, password)
        
        return HTTPBasicAuth(username, password)