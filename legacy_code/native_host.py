#!/usr/bin/env python3
"""
Native Messaging Host for LoadifyPro Browser Extension
This script runs as a standalone process to handle communication from the browser extension.
"""
import sys
import struct
import json
import logging
import os
from pathlib import Path

# Add the project directory to Python path
project_dir = Path(__file__).parent
sys.path.insert(0, str(project_dir))

# Import the browser integration
from browser_integration import BrowserIntegrationListener
import queue

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    filename=project_dir / 'native_host.log',
    filemode='a'
)
logger = logging.getLogger(__name__)

def main():
    """Main function to run the native messaging host."""
    logger.info("Native messaging host starting...")
    
    # Create a message queue (we'll just print URLs for now)
    message_queue = queue.Queue()
    
    # Create and start the listener
    listener = BrowserIntegrationListener(message_queue)
    listener.start()
    
    try:
        # Process messages from the queue
        while True:
            try:
                # Check for messages (non-blocking)
                if not message_queue.empty():
                    url = message_queue.get_nowait()
                    logger.info(f"Received URL from browser: {url}")
                    
                    # Send response back to browser
                    response = {"status": "success", "message": f"URL received: {url}"}
                    send_response(response)
                    
            except queue.Empty:
                # No messages, continue
                pass
            except KeyboardInterrupt:
                logger.info("Native host shutting down...")
                break
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                break
                
    finally:
        listener.stop()

def send_response(response):
    """Send a response back to the browser extension."""
    try:
        response_json = json.dumps(response)
        response_bytes = response_json.encode('utf-8')
        
        # Send the length of the response
        length = struct.pack('@I', len(response_bytes))
        sys.stdout.buffer.write(length)
        sys.stdout.buffer.write(response_bytes)
        sys.stdout.buffer.flush()
        
        logger.info(f"Sent response: {response}")
    except Exception as e:
        logger.error(f"Error sending response: {e}")

if __name__ == "__main__":
    main()
