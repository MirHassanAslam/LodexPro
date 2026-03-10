"""
Speed Limiter for LoadifyPro
Provides application-wide bandwidth management using a thread-safe
token bucket algorithm for smooth and accurate rate limiting.
"""
import time
import threading
import logging

logger = logging.getLogger(__name__)

class SpeedLimiter:
    """
    A thread-safe speed limiter using the token bucket algorithm. This allows for
    smooth and accurate bandwidth throttling across multiple download threads.
    """

    def __init__(self):
        """Initializes the SpeedLimiter."""
        self.rate_limit_bytes_per_sec = 0
        self.tokens = 0.0
        self.last_refill_time = time.monotonic()
        self.lock = threading.Lock()
        self.is_enabled = False
        logger.info("SpeedLimiter initialized.")

    def configure(self, is_enabled: bool, limit_kb_per_sec: float):
        """
        Configures and enables or disables the speed limit.

        Args:
            is_enabled (bool): Whether the speed limit should be active.
            limit_kb_per_sec (float): The speed limit in kilobytes per second.
        """
        with self.lock:
            self.is_enabled = is_enabled
            if self.is_enabled and limit_kb_per_sec > 0:
                self.rate_limit_bytes_per_sec = limit_kb_per_sec * 1024
                self.tokens = self.rate_limit_bytes_per_sec
                logger.info(f"Speed limit ENABLED and set to {limit_kb_per_sec:.2f} KB/s.")
            else:
                self.is_enabled = False
                self.rate_limit_bytes_per_sec = 0
                logger.info("Speed limit DISABLED.")

    def consume(self, amount_bytes: int):
        """
        Consume a number of bytes from the bucket. If not enough tokens are
        available, this method will block until they are replenished.
        """
        if not self.is_enabled or self.rate_limit_bytes_per_sec <= 0:
            return

        if amount_bytes <= 0: return

        needed = amount_bytes
        while needed > 0:
            with self.lock:
                self._refill()
                consume_amount = min(needed, self.tokens)
                if consume_amount > 0:
                    self.tokens -= consume_amount
                    needed -= consume_amount

            if needed > 0:
                sleep_duration = needed / self.rate_limit_bytes_per_sec
                time.sleep(sleep_duration)

    def _refill(self):
        """(Internal) Adds new tokens to the bucket based on elapsed time."""
        now = time.monotonic()
        elapsed = now - self.last_refill_time
        if elapsed > 0:
            new_tokens = elapsed * self.rate_limit_bytes_per_sec
            self.tokens = min(self.tokens + new_tokens, self.rate_limit_bytes_per_sec)
            self.last_refill_time = now