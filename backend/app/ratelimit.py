"""Sliding-window limiter for failed logins (in memory: one process. Use Redis or a DB table behind several workers)."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Callable

from .errors import RateLimited


class LoginRateLimiter:
    def __init__(self, max_failures: int, window_s: int, clock: Callable[[], float] = time.monotonic):
        self.max_failures = max_failures
        self.window_s = window_s
        self.clock = clock
        self._fails: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str) -> deque[float]:
        q = self._fails[key]
        cutoff = self.clock() - self.window_s
        while q and q[0] <= cutoff:
            q.popleft()
        if not q:
            self._fails.pop(key, None)
            return deque()
        return q

    def check(self, key: str) -> None:
        q = self._prune(key)
        if len(q) >= self.max_failures:
            retry = max(1, int(q[0] + self.window_s - self.clock()))
            raise RateLimited("Too many failed sign-in attempts. Try again later.", details={"retry_after_s": retry})

    def record_failure(self, key: str) -> None:
        self._prune(key)
        self._fails[key].append(self.clock())

    def reset(self, key: str) -> None:
        self._fails.pop(key, None)
