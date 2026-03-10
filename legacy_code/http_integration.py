"""
HTTP Integration for LoadifyPro
Provides a simple HTTP server for browser extension communication.
"""
import threading
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import urllib.parse

logger = logging.getLogger(__name__)

class LoadifyProHTTPHandler(BaseHTTPRequestHandler):
    """HTTP request handler for LoadifyPro integration."""
    
    def __init__(self, download_callback, *args, **kwargs):
        self.download_callback = download_callback
        super().__init__(*args, **kwargs)
    
    def do_POST(self):
        """Handle POST requests from browser extension."""
        if self.path == '/add_download':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                url = data.get('url', '')
                quality = data.get('quality', 'best')
                if url:
                    logger.info(f"Received URL from browser: {url}, Quality: {quality}")
                    
                    # Call the download callback with quality
                    if self.download_callback:
                        self.download_callback(url, quality)
                    
                    # Send success response
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    
                    response = {"status": "success", "message": "Download added"}
                    self.wfile.write(json.dumps(response).encode('utf-8'))
                else:
                    self.send_error(400, "No URL provided")
                    
            except Exception as e:
                logger.error(f"Error handling POST request: {e}")
                self.send_error(500, f"Internal server error: {e}")
        else:
            self.send_error(404, "Not found")
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def log_message(self, format, *args):
        """Override to use our logger."""
        logger.info(f"{self.address_string()} - {format % args}")

class HTTPIntegration:
    """HTTP server for browser integration."""
    
    def __init__(self, download_callback, port=8080):
        self.download_callback = download_callback
        self.port = port
        self.server = None
        self.thread = None
        
    def start(self):
        """Start the HTTP server in a separate thread."""
        if self.thread and self.thread.is_alive():
            logger.warning("HTTP server is already running.")
            return
            
        def handler(*args, **kwargs):
            return LoadifyProHTTPHandler(self.download_callback, *args, **kwargs)
            
        self.server = HTTPServer(('localhost', self.port), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        logger.info(f"HTTP integration server started on port {self.port}")
    
    def stop(self):
        """Stop the HTTP server."""
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            logger.info("HTTP integration server stopped")
