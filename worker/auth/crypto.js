// ── Cryptographic helpers ─────────────────────────────────────────
// PBKDF2-SHA256 for recovery code hashing (NIST SP 800-132 compliant).
// SubtleCrypto is available natively in Cloudflare Workers — no npm needed.

import { bytesToHex, hexToBytes } from '../utils.js';

const ITERATIONS = 600_000; // NIST 2023 recommendation for PBKDF2-SHA256

// Hash a recovery code with a random per-code salt.
// Returns { hash: hex, salt: hex }
export async function hashRecoveryCode(code) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveKey(code, salt);
  return { hash: bytesToHex(hash), salt: bytesToHex(salt) };
}

// Verify a plaintext code against a stored hash + salt.
// Constant-time by nature (both sides do the same PBKDF2 computation).
export async function verifyRecoveryCode(code, storedHash, storedSalt) {
  const derived = await deriveKey(code, hexToBytes(storedSalt));
  return bytesToHex(derived) === storedHash;
}

async function deriveKey(code, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(code.toUpperCase().replace(/-/g, '')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

// Generate a single recovery code: 10 chars from Base32 alphabet (no look-alikes).
// Displayed as XXXXX-XXXXX.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 32 chars, no 0/1/I/O

export function generateRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const chars = Array.from(bytes).map(b => ALPHABET[b % 32]).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

// Generate a cryptographically secure 2-digit display code (10–99)
export function generateDisplayCode() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return 10 + (arr[0] % 90); // range 10–99
}
