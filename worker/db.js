// ── D1 query helpers ──────────────────────────────────────────────
// All persistent data access lives here.
// KV (ephemeral) is handled directly in auth handlers.

import { hashRecoveryCode, generateRecoveryCode, verifyRecoveryCode } from './auth/crypto.js';

// ── Users ─────────────────────────────────────────────────────────

export async function getUserByEmail(db, email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
}

export async function getUserById(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
}

export async function getOrCreateUser(db, email) {
  const existing = await getUserByEmail(db, email);
  if (existing) return existing;
  const id = crypto.randomUUID();
  const now = Date.now();
  await db
    .prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)')
    .bind(id, email, now)
    .run();
  return { id, email, created_at: now };
}

export async function setUserFrozen(db, userId, frozenUntil) {
  await db
    .prepare('UPDATE users SET frozen_until = ? WHERE id = ?')
    .bind(frozenUntil, userId)
    .run();
}

export async function clearUserFrozen(db, userId) {
  await db
    .prepare('UPDATE users SET frozen_until = NULL WHERE id = ?')
    .bind(userId)
    .run();
}

export async function isUserFrozen(db, userId) {
  const user = await getUserById(db, userId);
  if (!user || !user.frozen_until) return false;
  return Date.now() < user.frozen_until;
}

// ── Passkey Credentials ───────────────────────────────────────────

export async function getPasskeyCredsByUserId(db, userId) {
  const result = await db
    .prepare('SELECT * FROM passkey_creds WHERE user_id = ?')
    .bind(userId)
    .all();
  return result.results;
}

export async function getPasskeyCredById(db, id) {
  return db.prepare('SELECT * FROM passkey_creds WHERE id = ?').bind(id).first();
}

export async function savePasskeyCred(db, { id, userId, publicKey, signCount, authenticatorType, isSynced, transport }) {
  await db
    .prepare(
      `INSERT INTO passkey_creds
        (id, user_id, public_key, sign_count, created_at, authenticator_type, is_synced, transport)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, userId, publicKey, signCount, Date.now(), authenticatorType || null, isSynced ? 1 : 0, transport || null)
    .run();
}

export async function updateSignCount(db, credId, newCount) {
  await db
    .prepare('UPDATE passkey_creds SET sign_count = ?, last_used_at = ? WHERE id = ?')
    .bind(newCount, Date.now(), credId)
    .run();
}

export async function updatePasskeyNickname(db, credId, userId, nickname) {
  await db
    .prepare('UPDATE passkey_creds SET nickname = ? WHERE id = ? AND user_id = ?')
    .bind(nickname, credId, userId)
    .run();
}

export async function deletePasskeyCred(db, credId, userId) {
  await db
    .prepare('DELETE FROM passkey_creds WHERE id = ? AND user_id = ?')
    .bind(credId, userId)
    .run();
}

export async function deleteAllPasskeyCredsByUserId(db, userId) {
  await db
    .prepare('DELETE FROM passkey_creds WHERE user_id = ?')
    .bind(userId)
    .run();
}

// ── Sessions ──────────────────────────────────────────────────────

export async function createSessionRecord(db, { id, userId, tokenHash, deviceName, userAgent, ip, trusted, expiresAt }) {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO sessions
        (id, user_id, token_hash, device_name, user_agent, ip, created_at, last_active_at, trusted, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, userId, tokenHash, deviceName || null, userAgent || null, ip || null, now, now, trusted ? 1 : 0, expiresAt)
    .run();
}

export async function getSessionByTokenHash(db, tokenHash) {
  return db.prepare('SELECT * FROM sessions WHERE token_hash = ?').bind(tokenHash).first();
}

export async function getSessionsByUserId(db, userId) {
  const result = await db
    .prepare('SELECT * FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_active_at DESC')
    .bind(userId, Date.now())
    .all();
  return result.results;
}

export async function updateSessionLastActive(db, sessionId) {
  await db
    .prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?')
    .bind(Date.now(), sessionId)
    .run();
}

export async function updateSessionTrusted(db, sessionId, trusted) {
  await db
    .prepare('UPDATE sessions SET trusted = ? WHERE id = ?')
    .bind(trusted ? 1 : 0, sessionId)
    .run();
}

export async function updateSessionDeviceName(db, sessionId, userId, deviceName) {
  await db
    .prepare('UPDATE sessions SET device_name = ? WHERE id = ? AND user_id = ?')
    .bind(deviceName, sessionId, userId)
    .run();
}

export async function deleteSessionById(db, sessionId, userId) {
  await db
    .prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?')
    .bind(sessionId, userId)
    .run();
}

export async function deleteAllSessionsByUserId(db, userId) {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}

export async function deleteUser(db, userId) {
  // Delete child records first (no CASCADE in schema)
  await db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM security_events WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM passkey_creds WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
}

export async function deleteAllSessionsByUserIdExcept(db, userId, exceptSessionId) {
  await db
    .prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?')
    .bind(userId, exceptSessionId)
    .run();
}

export async function hasTrustedSessions(db, userId) {
  const result = await db
    .prepare('SELECT id FROM sessions WHERE user_id = ? AND trusted = 1 AND expires_at > ? LIMIT 1')
    .bind(userId, Date.now())
    .first();
  return !!result;
}

export async function isKnownDevice(db, userId, userAgent) {
  if (!userAgent) return false;
  const result = await db
    .prepare('SELECT id FROM sessions WHERE user_id = ? AND user_agent = ? AND expires_at > ? LIMIT 1')
    .bind(userId, userAgent, Date.now())
    .first();
  return !!result;
}

// ── Recovery Codes ────────────────────────────────────────────────

export async function generateAndStoreRecoveryCodes(db, userId) {
  // Wipe existing codes first (handles re-generation case)
  await db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').bind(userId).run();

  const generation = Date.now(); // use timestamp as generation ID
  const plainCodes = [];

  for (let i = 1; i <= 8; i++) {
    const code = generateRecoveryCode();
    const { hash, salt } = await hashRecoveryCode(code);
    await db
      .prepare(
        'INSERT INTO recovery_codes (id, user_id, code_hash, code_salt, position, generation) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(crypto.randomUUID(), userId, hash, salt, i, generation)
      .run();
    plainCodes.push(code);
  }

  return plainCodes; // returned once, never stored in plaintext
}

export async function getRecoveryCodeStatus(db, userId) {
  const result = await db
    .prepare('SELECT position, used, used_at FROM recovery_codes WHERE user_id = ? ORDER BY position')
    .bind(userId)
    .all();
  return result.results;
}

export async function countActiveRecoveryCodes(db, userId) {
  const result = await db
    .prepare('SELECT COUNT(*) as count FROM recovery_codes WHERE user_id = ? AND used = 0')
    .bind(userId)
    .first();
  return result?.count ?? 0;
}

// Attempts to consume a recovery code. Returns true if valid and consumed.
export async function consumeRecoveryCode(db, userId, plainCode) {
  const rows = await db
    .prepare('SELECT * FROM recovery_codes WHERE user_id = ? AND used = 0')
    .bind(userId)
    .all();

  for (const row of rows.results) {
    const valid = await verifyRecoveryCode(plainCode, row.code_hash, row.code_salt);
    if (valid) {
      await db
        .prepare('UPDATE recovery_codes SET used = 1, used_at = ? WHERE id = ?')
        .bind(Date.now(), row.id)
        .run();
      return true;
    }
  }
  return false;
}

// ── Security Events ───────────────────────────────────────────────

export async function logSecurityEvent(db, { userId, type, ip, userAgent, deviceName, metadata }) {
  await db
    .prepare(
      'INSERT INTO security_events (id, user_id, type, ip, user_agent, device_name, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      crypto.randomUUID(), userId, type,
      ip || null, userAgent || null, deviceName || null,
      metadata ? JSON.stringify(metadata) : null,
      Date.now()
    )
    .run();
}

export async function getSecurityEvents(db, userId, limit = 10) {
  const result = await db
    .prepare('SELECT * FROM security_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(userId, limit)
    .all();
  return result.results;
}
