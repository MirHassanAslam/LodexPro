"""
Browser Integration for LoadifyPro
Handles communication from the browser extension via Native Messaging.
"""
import sys
import struct
import json
import threading
import logging
import queue

logger = logging.getLogger(__name__)

class BrowserIntegrationListener:
    """Listens for incoming messages from a web browser extension."""

    def __init__(self, message_queue: queue.Queue):
        """
        Initializes the listener.

        Args:
            message_queue: A thread-safe queue to pass received URLs to the main app.
        """
        self.message_queue = message_queue
        self.thread = None
        self.stop_event = threading.Event()
        logger.info("BrowserIntegrationListener initialized.")

    def start(self):
        """Starts the listener in a separate background thread."""
        if self.thread and self.thread.is_alive():
            logger.warning("Listener thread is already running.")
            return

        self.thread = threading.Thread(target=self._listen, daemon=True)
        self.thread.start()
        logger.info("Browser integration listener thread started.")

    def stop(self):
        """Signals the listener thread to stop."""
        self.stop_event.set()
        logger.info("Browser integration listener thread stopping.")

    def _listen(self):
        """The main loop that reads messages from stdin."""
        logger.info("Listening for messages from browser...")
        while not self.stop_event.is_set():
            try:
                # Read the 4-byte message length
                raw_length = sys.stdin.buffer.read(4)
                if not raw_length:
                    # stdin closed, likely browser was closed
                    break
                
                message_length = struct.unpack('@I', raw_length)[0]
                
                # Read the message content
                message = sys.stdin.buffer.read(message_length).decode('utf-8')
                data = json.loads(message)

                if 'url' in data:
                    logger.info(f"Received URL from browser: {data['url']}")
                    # Put the URL into the queue for the main GUI thread to process
                    self.message_queue.put(data['url'])

            except (struct.error, json.JSONDecodeError, UnicodeDecodeError) as e:
                logger.error(f"Error processing message from browser: {e}")
                # If there's an error, stop listening to prevent a loop
                break
            except Exception as e:
                logger.error(f"An unexpected error occurred in the listener: {e}")
                break
        
        logger.info("Browser integration listener has stopped.")
