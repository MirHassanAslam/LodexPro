"""
Download Core for LoadifyPro
Contains data structures and worker functions for all file and YouTube downloads.
This module is completely decoupled from the UI.
"""
import os
import time
import logging
from urllib.parse import urlparse, unquote
import threading
from typing import Optional, Callable

import requests
import yt_dlp

logger = logging.getLogger(__name__)

class DownloadState:
    """Enum-like class for tracking the state of a download."""
    QUEUED, DOWNLOADING, PAUSED, COMPLETED, ERROR, CANCELLED = "QUEUED", "DOWNLOADING", "PAUSED", "COMPLETED", "ERROR", "CANCELLED"

class DownloadItem:
    """A data class representing all properties of a single download task."""
    def __init__(self, url: str, destination: str):
        self.id = f"dl_{int(time.time() * 1000)}"
        self.url = url
        self.destination = destination
        self.filename = self._extract_filename(url)
        self.filepath = os.path.join(self.destination, self.filename)
        self.state = DownloadState.QUEUED
        self.progress = 0.0
        self.total_size = 0
        self.downloaded_size = 0
        self.speed = 0.0
        self.time_remaining = "∞"
        self.is_youtube = "youtube.com" in url or "youtu.be" in url
        self.cancel_event = threading.Event()
        self.pause_event = threading.Event()
        self.scan_status: Optional[str] = None
        self.error_message: str = ""
        self.quality = 'best'
        self.paused = False

    @classmethod
    def from_dict(cls, data: dict):
        """Reconstruct a DownloadItem from a dictionary (e.g., from DB)."""
        item = cls(data['url'], data['destination'])
        item.id = data['id']
        item.filename = data['filename']
        item.filepath = data['filepath']
        item.state = data['state']
        item.progress = data['progress']
        item.total_size = data['total_size']
        item.downloaded_size = data['downloaded_size']
        item.quality = data.get('quality', 'best')
        item.is_youtube = bool(data['is_youtube'])
        item.error_message = data.get('error_message', '')
        # Reset state if it was downloading/queued to avoid auto-start confusion
        if item.state in [DownloadState.DOWNLOADING, DownloadState.QUEUED]:
            item.state = DownloadState.PAUSED
        return item

    def _extract_filename(self, url: str) -> str:
        """Robustly extracts a filename from a URL."""
        try:
            path = urlparse(url).path
            filename = os.path.basename(unquote(path))
            if filename: return filename
        except Exception: pass
        return f"download_{self.id}.file"
    
    def pause(self):
        """Pause the download."""
        self.paused = True
        self.pause_event.set()
        self.state = DownloadState.PAUSED
        logger.info(f"Download {self.id} paused")
    
    def resume(self):
        """Resume the download."""
        self.paused = False
        self.pause_event.clear()
        self.state = DownloadState.QUEUED
        logger.info(f"Download {self.id} resumed")

def download_youtube_task(item: DownloadItem, update_callback: Callable, finished_callback: Callable, managers: dict):
    """Worker task for downloading a YouTube video."""
    proxy_manager = managers['proxy']
    
    def progress_hook(d):
        if item.cancel_event.is_set(): raise yt_dlp.utils.DownloadCancelled('Download cancelled by user.')
        if item.pause_event.is_set(): 
            # Wait while paused
            while item.pause_event.is_set() and not item.cancel_event.is_set():
                time.sleep(0.1)
            if item.cancel_event.is_set(): raise yt_dlp.utils.DownloadCancelled('Download cancelled by user.')
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            if total > 0:
                downloaded, speed, eta = d.get('downloaded_bytes', 0), d.get('speed', 0), d.get('eta', 0)
                update = {'total_size': total, 'downloaded_size': downloaded, 'progress': (downloaded / total) * 100, 'speed': speed / 1024**2 if speed else 0, 'time_remaining': time.strftime('%H:%M:%S', time.gmtime(eta)) if eta else "∞"}
                update_callback(item.id, update)
    
    # Configure format based on quality setting
    format_selector = _get_format_selector(item.quality)
    
    try:
        ydl_opts = {
            'format': format_selector,
            'outtmpl': os.path.join(item.destination, '%(title)s.%(ext)s'),
            'progress_hooks': [progress_hook],
            'noplaylist': True,
            'quiet': True,
            'no_warnings': True,
            'proxy': proxy_manager.get_proxies().get('http') if proxy_manager.get_proxies() else None
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(item.url, download=False)
            filename = ydl.prepare_filename(info)
            update_callback(item.id, {'filename': os.path.basename(filename)})
            ydl.download([item.url])
        
        final_state = DownloadState.COMPLETED if not item.cancel_event.is_set() else DownloadState.CANCELLED
    except yt_dlp.utils.DownloadCancelled: 
        final_state = DownloadState.CANCELLED
    except Exception as e: 
        logger.error(f"YouTube download failed for {item.url}: {e}")
        final_state = DownloadState.ERROR
        item.error_message = str(e)
    finally:
        update_callback(item.id, {'state': final_state})
        finished_callback(item.id)

def _get_format_selector(quality: str) -> str:
    """Get yt-dlp format selector based on quality preference."""
    quality_map = {
        'best': 'best[ext=mp4]/best',
        '2160p': 'best[height<=2160][ext=mp4]/best[height<=2160]',
        '1080p': 'best[height<=1080][ext=mp4]/best[height<=1080]',
        '720p': 'best[height<=720][ext=mp4]/best[height<=720]',
        '480p': 'best[height<=480][ext=mp4]/best[height<=480]',
        '360p': 'best[height<=360][ext=mp4]/best[height<=360]',
        'audio': 'bestaudio[ext=mp3]/bestaudio',
        'audio_m4a': 'bestaudio[ext=m4a]/bestaudio'
    }
    return quality_map.get(quality, 'best[ext=mp4]/best')

def download_direct_file_task(item: DownloadItem, update_callback: Callable, finished_callback: Callable, managers: dict):
    """Worker task for downloading a direct file."""
    try:
        proxies = managers['proxy'].get_proxies()
        auth = managers['auth'].get_auth()
        speed_limiter = managers['speed_limiter']
        with requests.get(item.url, stream=True, timeout=30, proxies=proxies, auth=auth) as r:
            r.raise_for_status()
            total_size = int(r.headers.get('content-length', 0))
            update_callback(item.id, {'total_size': total_size})
            downloaded, start_time = 0, time.time()
            with open(item.filepath, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if item.cancel_event.is_set(): break
                    if chunk:
                        speed_limiter.consume(len(chunk))
                        f.write(chunk); downloaded += len(chunk)
                        elapsed = time.time() - start_time
                        speed = downloaded / elapsed / 1024**2 if elapsed > 1 else 0
                        eta = (total_size - downloaded) / (speed * 1024**2) if speed > 0 and total_size > 0 else 0
                        update = {'downloaded_size': downloaded, 'progress': (downloaded / total_size) * 100 if total_size > 0 else 0, 'speed': speed, 'time_remaining': time.strftime('%H:%M:%S', time.gmtime(eta)) if eta else "∞"}
                        update_callback(item.id, update)
        final_state = DownloadState.COMPLETED if not item.cancel_event.is_set() else DownloadState.CANCELLED
    except (requests.exceptions.RequestException, ConnectionError) as e: logger.error(f"Network error for {item.url}: {e}"); final_state = DownloadState.ERROR; item.error_message = f"Network Error: {e}"
    except Exception as e: logger.error(f"Direct download failed for {item.url}: {e}"); final_state = DownloadState.ERROR; item.error_message = str(e)
    finally:
        update_callback(item.id, {'state': final_state})
        finished_callback(item.id)

