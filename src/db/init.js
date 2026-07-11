import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool, query } from "./pool.js";
import { businessProfile } from "../config/businessProfile.js";
import { buildLicenseToken } from "../services/license.js";

const ownerEmail = process.env.OWNER_EMAIL || "owner@senyumdental.test";
const ownerPassword = process.env.OWNER_PASSWORD || "ChangeMe123!";
const ownerName = process.env.OWNER_NAME || "Clinic Owner";
const adminEmail = process.env.ADMIN_EMAIL || "admin@senyumdental.test";
const adminPassword = process.env.ADMIN_PASSWORD || "Admin12345!";
const adminName = process.env.ADMIN_NAME || "Clinic Admin";

async function init() {
  await query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner', 'admin')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      service TEXT NOT NULL,
      requested_at TIMESTAMPTZ NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS site_content (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS license_tokens (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const seedUsers = [
    { name: ownerName, email: ownerEmail, password: ownerPassword, role: "owner" },
    { name: adminName, email: adminEmail, password: adminPassword, role: "admin" }
  ];

  for (const user of seedUsers) {
    const hash = await bcrypt.hash(user.password, 12);
    await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role`,
      [user.name, user.email.toLowerCase(), hash, user.role]
    );
  }

  await query(
    `INSERT INTO site_content (key, value)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO NOTHING`,
    [
      "homepage",
      JSON.stringify(businessProfile)
    ]
  );

  const initialLicense = buildLicenseToken();
  await query(
    `INSERT INTO license_tokens (id, token, expires_at)
     VALUES (1, $1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [initialLicense.token, initialLicense.expiresAt]
  );

  console.log("Database ready.");
  console.log(`Owner login: ${ownerEmail}`);
  console.log(`Admin login: ${adminEmail}`);
  await pool.end();
}

init().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
