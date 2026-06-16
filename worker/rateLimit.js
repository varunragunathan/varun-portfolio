// ── Sliding-window rate limiter using KV ─────────────────────────
//
// Chat rate limit keys (per userId):
//   rate:chat:{userId}:w:{tenMinWindow}  TTL 700s   (user short window)
//   rate:chat:{userId}:d:{dayWindow}     TTL 90000s (daily window)
//   rate:chat:{userId}:h:{hourWindow}    TTL 7200s  (pro short window)
//
// IP rate limit keys:
//   ip_rate:{bucket}:{ip}:{window}
//
// Limits:
//   user    → 5 per 10 min,  20 per day
//   pro     → 30 per hour,  200 per day
//   student → 30 per hour,  200 per day  (same as pro)
//   admin   → unlimited

export const DEFAULT_LIMITS = {
  user:    { windowMs: 10 * 60_000,   windowCount: 5,   day: 20  },
  pro:     { windowMs:      3_600_000, windowCount: 30,  day: 200 },
  student: { windowMs:      3_600_000, windowCount: 30,  day: 200 },
  admin:   null,
};

const LIMITS_KV_KEY = 'config:chat_rate_limits';

// Module-level cache so repeated chat requests within the same Worker instance
// never hit KV for this rarely-changing config value.
let _limitsCache = null;
let _limitsCacheAt = 0;

// Read effective limits: KV overrides merged over defaults.
// Cached in-process for 60 s and at the CF edge for 300 s (cacheTtl).
export async function getEffectiveLimits(kv) {
  const now = Date.now();
  if (_limitsCache && now - _limitsCacheAt < 60_000) return _limitsCache;
  try {
    const raw = await kv.get(LIMITS_KV_KEY, { cacheTtl: 300 });
    if (!raw) {
      _limitsCache = DEFAULT_LIMITS;
    } else {
      const overrides = JSON.parse(raw);
      const merged = { ...DEFAULT_LIMITS };
      for (const role of ['user', 'pro', 'student']) {
        if (overrides[role]) merged[role] = { ...DEFAULT_LIMITS[role], ...overrides[role] };
      }
      _limitsCache = merged;
    }
  } catch {
    _limitsCache = DEFAULT_LIMITS;
  }
  _limitsCacheAt = now;
  return _limitsCache;
}

export function invalidateLimitsCache() {
  _limitsCache = null;
  _limitsCacheAt = 0;
}

export async function saveEffectiveLimits(kv, limits) {
  const payload = {};
  for (const role of ['user', 'pro', 'student']) {
    if (limits[role]) payload[role] = limits[role];
  }
  await kv.put(LIMITS_KV_KEY, JSON.stringify(payload));
}

// Returns { allowed: bool, retryAfter?: number (seconds), reason?: string }
export async function checkRateLimit(kv, userId, role) {
  const effectiveLimits = await getEffectiveLimits(kv);
  const limits = effectiveLimits[role] ?? effectiveLimits.user;
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
    const label      = (role === 'pro' || role === 'student') ? 'hour' : '10 minutes';
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

// ── Generic per-user sliding-window rate limiter ──────────────────
// Separate from the chat limiter — uses `rate:{bucket}:{userId}:…` keys.
//
// limits shape: { user: { windowMs, windowCount, day }, admin: null, … }
// Roles not in limits fall back to 'user'.
export async function checkUserRateLimit(kv, userId, role, bucket, limits) {
  const roleLimits = limits[role] ?? limits.user;
  if (roleLimits === null) return { allowed: true };

  const now       = Date.now();
  const winWindow = Math.floor(now / roleLimits.windowMs);
  const dayWindow = Math.floor(now / 86_400_000);

  const wKey = `rate:${bucket}:${userId}:w:${winWindow}`;
  const dKey = `rate:${bucket}:${userId}:d:${dayWindow}`;

  const [wRaw, dRaw] = await Promise.all([kv.get(wKey), kv.get(dKey)]);
  const wCount = wRaw !== null ? parseInt(wRaw, 10) : 0;
  const dCount = dRaw !== null ? parseInt(dRaw, 10) : 0;

  if (wCount >= roleLimits.windowCount) {
    const next       = (winWindow + 1) * roleLimits.windowMs;
    const retryAfter = Math.ceil((next - now) / 1000);
    return { allowed: false, retryAfter, reason: `${roleLimits.windowCount} per hour` };
  }
  if (dCount >= roleLimits.day) {
    const nextDay    = (dayWindow + 1) * 86_400_000;
    const retryAfter = Math.ceil((nextDay - now) / 1000);
    return { allowed: false, retryAfter, reason: `${roleLimits.day} per day` };
  }

  const winTtl = Math.ceil(roleLimits.windowMs / 1000) + 60;
  await Promise.all([
    kv.put(wKey, String(wCount + 1), { expirationTtl: winTtl }),
    kv.put(dKey, String(dCount + 1), { expirationTtl: 90000 }),
  ]);
  return { allowed: true };
}

// Limits for discussion write actions
export const DISCUSSION_LIMITS = {
  topic: {
    user:  { windowMs: 3_600_000, windowCount: 5,  day: 20  },
    admin: null,
  },
  comment: {
    user:  { windowMs: 3_600_000, windowCount: 20, day: 100 },
    admin: null,
  },
  delete: {
    user:  { windowMs: 3_600_000, windowCount: 10, day: 50 },
    admin: null,
  },
};

// ── IP-based rate limiter ─────────────────────────────────────────
// bucket   — namespaces the key (e.g. 'auth', 'otp', 'feedback')
// limit    — max requests allowed in the window
// windowMs — window size in milliseconds
//
// Returns { allowed: bool, retryAfter?: number (seconds) }
// If ip is falsy (local dev, no CF-Connecting-IP) always allows.
export async function checkIpRateLimit(kv, ip, bucket, limit, windowMs) {
  if (!ip) return { allowed: true };

  const now    = Date.now();
  const window = Math.floor(now / windowMs);
  const key    = `ip_rate:${bucket}:${ip}:${window}`;

  // cacheTtl caches the read at the CF edge so repeated requests from the same
  // IP (including rate-limited bots) don't generate a KV read each time.
  const raw   = await kv.get(key, { cacheTtl: 60 });
  const count = raw !== null ? parseInt(raw, 10) : 0;

  if (count >= limit) {
    const retryAfter = Math.ceil(((window + 1) * windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  const ttl = Math.ceil(windowMs / 1000) + 60;
  await kv.put(key, String(count + 1), { expirationTtl: ttl });
  return { allowed: true };
}
