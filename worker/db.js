// ── D1 query helpers ─────────────────────────────────────────────
// All persistent data lives here: users and passkey credentials.
// KV (ephemeral) is handled directly in auth handlers.

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

export async function savePasskeyCred(db, { id, userId, publicKey, signCount }) {
  await db
    .prepare(
      'INSERT INTO passkey_creds (id, user_id, public_key, sign_count, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(id, userId, publicKey, signCount, Date.now())
    .run();
}

export async function updateSignCount(db, credId, newCount) {
  await db
    .prepare('UPDATE passkey_creds SET sign_count = ?, last_used_at = ? WHERE id = ?')
    .bind(newCount, Date.now(), credId)
    .run();
}
