// ── Shared utilities ──────────────────────────────────────────────

export function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return arr;
}

// SHA-256 hash of a string → hex (used for token hashing)
export async function sha256Hex(str) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return bytesToHex(new Uint8Array(bytes));
}

// Infer a human-readable device name from User-Agent
export function inferDeviceName(ua = '') {
  if (/iPhone/.test(ua))       return 'iPhone';
  if (/iPad/.test(ua))         return 'iPad';
  if (/Android/.test(ua))      return 'Android Device';
  if (/Macintosh/.test(ua))    return 'Mac';
  if (/Windows/.test(ua))      return 'Windows PC';
  if (/Linux/.test(ua))        return 'Linux Device';
  return 'Unknown Device';
}

// Extract client IP from Cloudflare request headers
export function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown';
}
