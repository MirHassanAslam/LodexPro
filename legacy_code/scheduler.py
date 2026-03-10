"""
Download Scheduler for LoadifyPro
Manages time-based scheduling for starting download tasks in a non-blocking background thread.
"""
import sched
import time
import threading
import logging
from typing import Callable, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

class Job:
    """A data class representing a single scheduled job."""
    def __init__(self, job_id: str, start_time: datetime, action: Callable, args: tuple):
        self.id = job_id
        self.start_time = start_time
        self.action = action
        self.args = args
        self.is_cancelled = False

class Scheduler:
    """A thread-safe scheduler for managing time-based tasks."""

    def __init__(self):
        self.scheduler = sched.scheduler(time.monotonic, time.sleep)
        self.jobs: dict[str, Job] = {}
        self.worker_thread: Optional[threading.Thread] = None
        self.stop_event = threading.Event()
        self.lock = threading.Lock()
        logger.info("Scheduler initialized.")

    def start(self):
        """Starts the scheduler's background worker thread."""
        if self.worker_thread and self.worker_thread.is_alive():
            logger.warning("Scheduler start() called but it is already running.")
            return

        self.stop_event.clear()
        self.worker_thread = threading.Thread(target=self._run, daemon=True)
        self.worker_thread.start()
        logger.info("Scheduler worker thread started.")

    def stop(self):
        """Stops the scheduler's background worker thread gracefully."""
        if not self.worker_thread or not self.worker_thread.is_alive():
            return

        self.stop_event.set()
        self.worker_thread.join(timeout=5) # Wait for thread to finish
        logger.info("Scheduler worker thread stopped.")

    def _run(self):
        """The main loop for the scheduler thread."""
        while not self.stop_event.is_set():
            with self.lock:
                self.scheduler.run(blocking=False)
            time.sleep(1) # Check for new events every second

    def schedule_task(self, start_time: datetime, action: Callable, args: tuple = ()) -> str:
        """Schedules a new task to be executed at a specific time."""
        job_id = f"job_{int(time.time() * 1000)}"
        job = Job(job_id, start_time, action, args)
        
        with self.lock:
            self.jobs[job_id] = job
            delay = (start_time - datetime.now()).total_seconds()
            delay = max(delay, 0) # Ensure delay is not negative
            
            self.scheduler.enter(delay, 1, self._execute_job, (job_id,))
        
        logger.info(f"Scheduled job {job_id} to run at {start_time}.")
        return job_id

    def cancel_job(self, job_id: str) -> bool:
        """Cancels a pending scheduled job."""
        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id].is_cancelled = True
                # Clean up from low-level scheduler queue
                for event in self.scheduler.queue[:]: # Iterate over a copy
                    if event.argument and event.argument[0] == job_id:
                        try:
                            self.scheduler.cancel(event)
                        except ValueError:
                            pass # Event might have already been executed
                logger.info(f"Cancelled scheduled job {job_id}.")
                return True
        logger.warning(f"Could not cancel job {job_id}: not found.")
        return False

    def _execute_job(self, job_id: str):
        """Wrapper to execute the job's action, handling cancellation and errors."""
        with self.lock:
            job = self.jobs.get(job_id)
            if job and not job.is_cancelled:
                logger.info(f"Executing scheduled job {job_id}.")
                try:
                    job.action(*job.args)
                except Exception as e:
                    logger.error(f"Error executing job {job_id}: {e}")
                finally:
                    if job_id in self.jobs:
                        del self.jobs[job_id]