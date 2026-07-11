import { query } from "../db/pool.js";

const DEFAULT_GRACE_DAYS = Number(process.env.LICENSE_GRACE_DAYS || 30);

export function normalizeToken(token) {
  return String(token || "").trim();
}

export function buildLicenseToken(days = DEFAULT_GRACE_DAYS) {
  const validDays = Number.isFinite(Number(days)) ? Math.max(1, Number(days)) : DEFAULT_GRACE_DAYS;
  const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);
  return buildLicenseTokenUntil(expiresAt);
}

export function buildLicenseTokenUntil(expiresAt) {
  const validExpiresAt = new Date(expiresAt);
  return {
    token: `SD-${validExpiresAt.toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    expiresAt: validExpiresAt
  };
}

export async function getCurrentLicense() {
  const result = await query(
    `SELECT token, expires_at, updated_at
     FROM license_tokens
     ORDER BY updated_at DESC
     LIMIT 1`
  );
  const license = result.rows[0] || null;
  if (!license) {
    return { token: null, expiresAt: null, updatedAt: null, active: false };
  }

  const expiresAt = new Date(license.expires_at);
  return {
    token: license.token,
    expiresAt: license.expires_at,
    updatedAt: license.updated_at,
    active: expiresAt.getTime() > Date.now()
  };
}

export async function upsertLicense(token, expiresAt) {
  const cleanToken = normalizeToken(token);
  const result = await query(
    `INSERT INTO license_tokens (id, token, expires_at, updated_at)
     VALUES (1, $1, $2, now())
     ON CONFLICT (id) DO UPDATE
     SET token = EXCLUDED.token,
         expires_at = EXCLUDED.expires_at,
         updated_at = now()
     RETURNING token, expires_at, updated_at`,
    [cleanToken, expiresAt]
  );
  return getCurrentLicense(result.rows[0]);
}
