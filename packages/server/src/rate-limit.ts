import type { RequestHandler } from 'express';

interface BucketEntry {
  windowStart: number;
  count: number;
}

export function createRateLimiter(windowMs: number) {
  const buckets = new Map<string, BucketEntry>();

  const cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - windowMs * 2;
    for (const [key, entry] of buckets) {
      if (entry.windowStart < cutoff) buckets.delete(key);
    }
  }, 5 * 60_000);
  cleanupTimer.unref();

  function rateLimit(max: number): RequestHandler {
    return (req, res, next) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const key = `${ip}:${max}`;
      const now = Date.now();

      let entry = buckets.get(key);
      if (!entry || now - entry.windowStart > windowMs) {
        entry = { windowStart: now, count: 0 };
        buckets.set(key, entry);
      }
      entry.count++;

      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));

      if (entry.count > max) {
        res.status(429).json({ error: 'Too many requests. Try again later.' });
        return;
      }
      next();
    };
  }

  return { rateLimit, cleanup: () => clearInterval(cleanupTimer) };
}
