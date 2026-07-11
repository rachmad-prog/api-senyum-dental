import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireActiveLicense, requireAuth } from "../middleware/auth.js";
import { buildLicenseTokenUntil, getCurrentLicense, normalizeToken, upsertLicense } from "../services/license.js";

const router = Router();

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).optional().or(z.literal("")),
  role: z.enum(["owner", "admin"]).default("admin")
});

const imageSourceSchema = z.string().refine((value) => (
  z.string().url().safeParse(value).success || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(value)
), "Gambar harus berupa URL valid atau file gambar yang diupload.");

const siteSchema = z.object({
  name: z.string().min(2),
  tagline: z.string().min(5),
  address: z.string().min(2),
  phone: z.string().min(4),
  whatsapp: z.string().min(6),
  email: z.string().email(),
  rating: z.string().min(1),
  reviewCount: z.string().min(1),
  mapsUrl: z.string().url(),
  hours: z.array(z.tuple([z.string(), z.string()])).min(1),
  services: z.array(z.object({
    title: z.string().min(2),
    description: z.string().min(5)
  })).min(1),
  photos: z.array(imageSourceSchema).min(1)
});

const licenseSchema = z.object({
  token: z.string().min(8).optional(),
  expiresAt: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Tanggal dan jam expired tidak valid.")
});

router.get("/overview", requireAuth(), requireActiveLicense({ allowOwner: true }), async (req, res, next) => {
  try {
    const canSeeUsers = req.user.role === "owner";
    const [appointments, messages, users, latestAppointments, latestMessages, userRows, site, license] = await Promise.all([
      query("SELECT COUNT(*)::int AS count FROM appointments"),
      query("SELECT COUNT(*)::int AS count FROM contact_messages"),
      query("SELECT COUNT(*)::int AS count FROM users"),
      query("SELECT id, name, phone, service, requested_at, status, message, created_at FROM appointments ORDER BY created_at DESC LIMIT 20"),
      query("SELECT id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 20"),
      canSeeUsers ? query("SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC") : Promise.resolve({ rows: [] }),
      query("SELECT value, updated_at FROM site_content WHERE key = 'homepage'"),
      getCurrentLicense()
    ]);

    res.json({
      counts: {
        appointments: appointments.rows[0].count,
        messages: messages.rows[0].count,
        users: canSeeUsers ? users.rows[0].count : null
      },
      latestAppointments: latestAppointments.rows,
      latestMessages: latestMessages.rows,
      users: userRows.rows,
      site: site.rows[0]?.value || null,
      siteUpdatedAt: site.rows[0]?.updated_at || null,
      license: req.user.role === "owner" ? license : null
    });
  } catch (error) {
    next(error);
  }
});

router.get("/license", requireAuth(["owner"]), async (req, res, next) => {
  try {
    res.json({ license: await getCurrentLicense() });
  } catch (error) {
    next(error);
  }
});

router.put("/license", requireAuth(["owner"]), async (req, res, next) => {
  try {
    const data = licenseSchema.parse(req.body);
    const expiresAt = new Date(data.expiresAt);
    const generated = buildLicenseTokenUntil(expiresAt);
    const license = await upsertLicense(normalizeToken(data.token) || generated.token, generated.expiresAt);
    res.json({ license, message: "Token license berhasil diperbarui." });
  } catch (error) {
    next(error);
  }
});

router.get("/users", requireAuth(["owner"]), requireActiveLicense(), async (req, res, next) => {
  try {
    const result = await query("SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC");
    res.json({ users: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/users", requireAuth(["owner"]), requireActiveLicense(), async (req, res, next) => {
  try {
    const data = userSchema.extend({ password: z.string().min(8) }).parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);

    const result = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [data.name, data.email.toLowerCase(), passwordHash, data.role]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put("/users/:id", requireAuth(["owner"]), requireActiveLicense(), async (req, res, next) => {
  try {
    const data = userSchema.parse(req.body);
    const params = [data.name, data.email.toLowerCase(), data.role, req.params.id];
    let sql = `UPDATE users SET name = $1, email = $2, role = $3 WHERE id = $4 RETURNING id, name, email, role, created_at`;

    if (data.password) {
      const passwordHash = await bcrypt.hash(data.password, 12);
      params.splice(3, 0, passwordHash);
      sql = `UPDATE users SET name = $1, email = $2, role = $3, password_hash = $4 WHERE id = $5 RETURNING id, name, email, role, created_at`;
    }

    const result = await query(sql, params);
    if (!result.rowCount) return res.status(404).json({ message: "User tidak ditemukan." });
    res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete("/users/:id", requireAuth(["owner"]), requireActiveLicense(), async (req, res, next) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: "Owner tidak bisa menghapus akun sendiri." });
    }
    const result = await query("DELETE FROM users WHERE id = $1 RETURNING id", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: "User tidak ditemukan." });
    res.json({ message: "User dihapus." });
  } catch (error) {
    next(error);
  }
});

router.patch("/appointments/:id", requireAuth(), requireActiveLicense(), async (req, res, next) => {
  try {
    const schema = z.object({ status: z.enum(["new", "confirmed", "done", "cancelled"]) });
    const data = schema.parse(req.body);
    const result = await query(
      "UPDATE appointments SET status = $1 WHERE id = $2 RETURNING id, name, phone, service, requested_at, status, message, created_at",
      [data.status, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ message: "Reservasi tidak ditemukan." });
    res.json({ appointment: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete("/appointments/:id", requireAuth(), requireActiveLicense(), async (req, res, next) => {
  try {
    const result = await query("DELETE FROM appointments WHERE id = $1 RETURNING id", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: "Reservasi tidak ditemukan." });
    res.json({ message: "Reservasi dihapus." });
  } catch (error) {
    next(error);
  }
});

router.delete("/messages/:id", requireAuth(), requireActiveLicense(), async (req, res, next) => {
  try {
    const result = await query("DELETE FROM contact_messages WHERE id = $1 RETURNING id", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: "Pesan tidak ditemukan." });
    res.json({ message: "Pesan dihapus." });
  } catch (error) {
    next(error);
  }
});

router.put("/site", requireAuth(), requireActiveLicense(), async (req, res, next) => {
  try {
    const data = siteSchema.parse(req.body);
    const result = await query(
      `INSERT INTO site_content (key, value, updated_at)
       VALUES ('homepage', $1::jsonb, now())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = now()
       RETURNING value, updated_at`,
      [JSON.stringify(data)]
    );
    res.json({ site: result.rows[0].value, updatedAt: result.rows[0].updated_at });
  } catch (error) {
    next(error);
  }
});

export default router;
