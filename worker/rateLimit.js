// ── Sliding-window rate limiter using KV ─────────────────────────
//
// KV keys:
//   rate:chat:{userId}:w:{tenMinWindow}  TTL 700s   (user short window)
//   rate:chat:{userId}:d:{dayWindow}     TTL 90000s (daily window)
//   rate:chat:{userId}:h:{hourWindow}    TTL 7200s  (pro short window)
//
// Limits:
//   user  → 5 per 10 min,  20 per day
//   pro   → 30 per hour,  200 per day
//   admin → unlimited

const LIMITS = {
  user:  { windowMs: 10 * 60_000,   windowCount: 5,   day: 20  },
  pro:   { windowMs:      3_600_000, windowCount: 30,  day: 200 },
  admin: null,
};

// Returns { allowed: bool, retryAfter?: number (seconds), reason?: string }
export async function checkRateLimit(kv, userId, role) {
  const limits = LIMITS[role] ?? LIMITS.user;
  if (limits === null) return { allowed: true };

  const now       = Date.now();
  const winWindow = Math.floor(now / limits.windowMs);
  const dayWindow = Math.floor(now / 86_400_000);

  const wKey = `rate:chat:${userId}:w:${winWindow}`;
  const dKey = `rate:chat:${userId}:d:${dayWindow}`;

  const [wRaw, dRaw] = await Promise.all([kv.get(wKey), kv.get(dKey)]);
  const wCount = wRaw !== null ? parseInt(wRaw, 10) : 0;
  const dCount = dRaw !== null ? parseInt(dRaw, 10) : 0;

  // Check short window
  if (wCount >= limits.windowCount) {
    const next       = (winWindow + 1) * limits.windowMs;
    const retryAfter = Math.ceil((next - now) / 1000);
    const label      = role === 'pro' ? 'hour' : '10 minutes';
    return { allowed: false, retryAfter, reason: `${limits.windowCount} messages per ${label}` };
  }

  // Check daily limit
  if (dCount >= limits.day) {
    const nextDay    = (dayWindow + 1) * 86_400_000;
    const retryAfter = Math.ceil((nextDay - now) / 1000);
    return { allowed: false, retryAfter, reason: `${limits.day} messages per day` };
  }

  const winTtl = Math.ceil(limits.windowMs / 1000) + 60;
  await Promise.all([
    kv.put(wKey, String(wCount + 1), { expirationTtl: winTtl }),
    kv.put(dKey, String(dCount + 1), { expirationTtl: 90000 }),
  ]);

  return { allowed: true };
}
