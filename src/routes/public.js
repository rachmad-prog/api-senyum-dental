import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { sendClinicMail } from "../services/mailer.js";
import { businessProfile } from "../config/businessProfile.js";
import { getCurrentLicense } from "../services/license.js";

const router = Router();

const appointmentSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  service: z.string().min(2),
  date: z.string().min(4),
  message: z.string().optional().default("")
});

const contactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  message: z.string().min(5)
});

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function requirePublicLicense(req, res, next) {
  try {
    const license = await getCurrentLicense();
    if (license.active) return next();
    return res.status(402).json({
      message: "Token license sudah habis masa tenggang. Halaman belum dapat digunakan sampai owner memperbarui license.",
      license
    });
  } catch (error) {
    return next(error);
  }
}

router.get("/business-profile", (req, res) => {
  res.json({ businessProfile });
});

router.get("/site", async (req, res, next) => {
  try {
    const license = await getCurrentLicense();
    const result = await query("SELECT value FROM site_content WHERE key = 'homepage'");
    res.json({ site: result.rows[0]?.value || businessProfile, license });
  } catch (error) {
    next(error);
  }
});

router.post("/appointments", requirePublicLicense, async (req, res, next) => {
  try {
    const data = appointmentSchema.parse(req.body);
    const requestedAt = new Date(data.date);
    if (Number.isNaN(requestedAt.getTime())) {
      return res.status(422).json({ message: "Tanggal reservasi tidak valid." });
    }

    await query(
      `INSERT INTO appointments (name, phone, service, requested_at, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [data.name, data.phone, data.service, requestedAt, data.message]
    );

    await sendClinicMail({
      subject: `Reservasi baru: ${data.service}`,
      html: `<h2>Reservasi baru</h2><p><b>Nama:</b> ${escapeHtml(data.name)}</p><p><b>Telepon:</b> ${escapeHtml(data.phone)}</p><p><b>Layanan:</b> ${escapeHtml(data.service)}</p><p><b>Waktu:</b> ${requestedAt.toLocaleString("id-ID")}</p><p>${escapeHtml(data.message)}</p>`
    });

    res.status(201).json({ message: "Reservasi terkirim. Tim klinik akan menghubungi Anda." });
  } catch (error) {
    next(error);
  }
});

router.post("/contact", requirePublicLicense, async (req, res, next) => {
  try {
    const data = contactSchema.parse(req.body);

    await query(
      `INSERT INTO contact_messages (name, email, message)
       VALUES ($1, $2, $3)`,
      [data.name, data.email, data.message]
    );

    await sendClinicMail({
      subject: `Pesan website dari ${data.name}`,
      replyTo: data.email,
      html: `<h2>Pesan website</h2><p><b>Nama:</b> ${escapeHtml(data.name)}</p><p><b>Email:</b> ${escapeHtml(data.email)}</p><p>${escapeHtml(data.message)}</p>`
    });

    res.status(201).json({ message: "Pesan terkirim ke email klinik." });
  } catch (error) {
    next(error);
  }
});

export default router;
