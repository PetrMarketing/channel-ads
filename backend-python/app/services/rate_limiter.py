"""Простой async rate-limiter (token bucket) для равномерной рассылки.

Использование:
    limiter = RateLimiter(rate_per_second=17)
    sem = asyncio.Semaphore(10)
    async def send_one(item):
        async with sem:
            await limiter.acquire()
            await actually_send(item)
    await asyncio.gather(*[send_one(x) for x in items])
"""
import asyncio


class RateLimiter:
    """Гарантирует что между acquire() будет минимум 1/rate секунд.
    Это распределяет нагрузку равномерно (а не пачкой как при concurrent gather)."""

    def __init__(self, rate_per_second: float):
        self._interval = 1.0 / max(0.1, float(rate_per_second))
        self._next_at = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            loop = asyncio.get_event_loop()
            now = loop.time()
            wait = self._next_at - now
            if wait > 0:
                await asyncio.sleep(wait)
                now = loop.time()
            # Следующий слот не раньше чем сейчас (защита от "догонки" после паузы)
            self._next_at = max(now, self._next_at) + self._interval
