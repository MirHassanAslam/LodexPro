"""
Antivirus Manager for LoadifyPro
Provides a robust framework for integrating various antivirus engines.
"""
import os
import logging
import threading
import subprocess
import time
import json
import hashlib
import shutil
import sys
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from enum import Enum
import requests

logger = logging.getLogger(__name__)

class AntivirusEngine(Enum):
    WINDOWS_DEFENDER = "windows_defender"
    VIRUSTOTAL = "virustotal"

class ScanStatus(Enum):
    PENDING, SCANNING, CLEAN, INFECTED, ERROR, QUARANTINED, TIMEOUT, SKIPPED = "PENDING", "SCANNING", "CLEAN", "INFECTED", "ERROR", "QUARANTINED", "TIMEOUT", "SKIPPED"

@dataclass
class ScanResult:
    file_path: str; engine: AntivirusEngine; status: ScanStatus
    threats_found: List[str] = field(default_factory=list)
    scan_time: float = 0.0
    scan_date: str = field(default_factory=lambda: time.strftime('%Y-%m-%d %H:%M:%S'))
    error_message: str = ""; file_hash: str = ""

class AntivirusManager:
    """Manages all antivirus scanning, configuration, and quarantine operations."""
    def __init__(self, update_callback=None):
        self.configs: Dict[str, dict] = {}
        self.active_config_name: Optional[str] = None
        self.quarantine_dir = os.path.join(os.getcwd(), "quarantine")
        self.scan_history: List[ScanResult] = []
        self.lock = threading.Lock()
        self.update_callback = update_callback
        os.makedirs(self.quarantine_dir, exist_ok=True)
        self._init_default_configs()

    def _init_default_configs(self):
        if "Windows Defender" not in self.configs and sys.platform == "win32":
            self.configs["Windows Defender"] = {'engine': AntivirusEngine.WINDOWS_DEFENDER.value, 'enabled': True, 'auto_scan': True, 'quarantine_infected': True}
        if "VirusTotal" not in self.configs:
            self.configs["VirusTotal"] = {'engine': AntivirusEngine.VIRUSTOTAL.value, 'enabled': True, 'auto_scan': False, 'api_key': ''}
        if self.active_config_name is None and "Windows Defender" in self.configs:
            self.active_config_name = "Windows Defender"

    def scan_file_async(self, file_path: str, download_id: str):
        if not self.active_config_name or self.active_config_name not in self.configs: return
        config = self.configs[self.active_config_name]
        if not config.get('enabled') or not config.get('auto_scan'):
            if self.update_callback: self.update_callback(download_id, {'scan_status': ScanStatus.SKIPPED.value})
            return
        threading.Thread(target=self._scan_file_worker, args=(file_path, config, download_id), daemon=True).start()

    def _scan_file_worker(self, file_path: str, config: dict, download_id: str):
        if self.update_callback: self.update_callback(download_id, {'scan_status': ScanStatus.SCANNING.value})
        start_time = time.time(); file_hash = self._calculate_file_hash(file_path)
        engine = AntivirusEngine(config['engine'])
        result = ScanResult(file_path=file_path, engine=engine, status=ScanStatus.SCANNING, file_hash=file_hash)
        try:
            if not os.path.exists(file_path): raise FileNotFoundError("File to scan does not exist.")
            method = {'WINDOWS_DEFENDER': self._scan_with_defender, 'VIRUSTOTAL': self._scan_with_virustotal}.get(engine.name)
            if method: result = method(file_path, config, result)
            else: raise ValueError(f"Unsupported engine: {engine}")
        except Exception as e: logger.error(f"Scan worker failed: {e}"); result.status = ScanStatus.ERROR; result.error_message = str(e)
        result.scan_time = time.time() - start_time
        if result.status == ScanStatus.INFECTED and config.get('quarantine_infected'):
            if self._quarantine_file(file_path): result.status = ScanStatus.QUARANTINED
        with self.lock: self.scan_history.append(result)
        if self.update_callback: self.update_callback(download_id, {'scan_status': result.status.value, 'scan_result': result.threats_found})

    def _scan_with_defender(self, file_path, config, result):
        if sys.platform != "win32": raise OSError("Windows Defender is only on Windows.")
        command = f'Start-MpScan -ScanPath "{file_path}" -ScanType QuickScan; $threat = Get-MpThreatDetection -ThreatStatus Active | Where-Object {{ $_.Resources.Path -eq "{file_path}" }}; if ($threat) {{ exit 1 }} else {{ exit 0 }}'
        try:
            proc = subprocess.run(["powershell", "-Command", command], capture_output=True, text=True, timeout=300, check=False)
            if proc.returncode == 0: result.status = ScanStatus.CLEAN
            elif proc.returncode == 1: result.status = ScanStatus.INFECTED; result.threats_found.append("Threat detected by Defender")
            else: result.status = ScanStatus.ERROR; result.error_message = proc.stderr or "Defender scan failed."
        except subprocess.TimeoutExpired: result.status = ScanStatus.TIMEOUT; result.error_message = "Scan timed out."
        return result

    def _scan_with_virustotal(self, file_path, config, result):
        api_key = config.get('api_key')
        if not api_key: raise ValueError("VirusTotal API key is not configured.")
        url, headers = f"https://www.virustotal.com/api/v3/files/{result.file_hash}", {"x-apikey": api_key}
        try:
            response = requests.get(url, headers=headers, timeout=30)
            if response.status_code == 404: result.status = ScanStatus.CLEAN; result.threats_found.append("File not on VirusTotal (Unknown)."); return result
            response.raise_for_status()
            stats = response.json().get("data", {}).get("attributes", {}).get("last_analysis_stats", {})
            if stats.get("malicious", 0) > 0: result.status = ScanStatus.INFECTED; result.threats_found.append(f"{stats['malicious']} engines flagged this file.")
            else: result.status = ScanStatus.CLEAN
        except requests.exceptions.RequestException as e: raise ConnectionError(f"VirusTotal API request failed: {e}")
        return result

    def _quarantine_file(self, file_path: str) -> bool:
        if not os.path.exists(file_path): return False
        try:
            name = f"{int(time.time())}_{os.path.basename(file_path)}.quarantined"
            shutil.move(file_path, os.path.join(self.quarantine_dir, name)); return True
        except (IOError, OSError) as e: logger.error(f"Failed to quarantine file: {e}"); return False

    def _calculate_file_hash(self, file_path: str) -> str:
        sha256 = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                while chunk := f.read(8192): sha256.update(chunk)
            return sha256.hexdigest()
        except (FileNotFoundError, IOError) as e: logger.error(f"Could not hash file {file_path}: {e}"); return ""

