import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import publicRoutes from "./routes/public.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 4000;
const clientDist = path.resolve(__dirname, "../../client/dist");

// Mengambil daftar origin yang diizinkan dari .env, default ke localhost untuk dev
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// 1. Longgarkan Helmet (Matikan CSP agar tidak memblokir fetch/gambar di frontend statis)
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

// 2. Konfigurasi CORS yang lebih ramah dan tidak bikin crash jika error
app.use(
  cors({
    origin(origin, callback) {
      // Izinkan jika request datang tanpa origin (misal dari Postman atau server-to-server)
      if (!origin) return callback(null, true);

      // Cek apakah origin terdaftar di .env atau merupakan localhost
      const isAllowed = allowedOrigins.includes(origin);
      const isLocalDev = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(
        origin,
      );

      if (isAllowed || isLocalDev) {
        return callback(null, true);
      }

      // Jangan lempar Error (new Error) karena bisa bikin Express menganggapnya status 500.
      // Cukup kembalikan false agar browser yang memblokir secara alami di client-side.
      return callback(null, false);
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "8mb" }));

// Routes API
app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api", publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

// Menyajikan file statis Frontend (SPA Fallback)
app.use(express.static(clientDist));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ message: "Endpoint tidak ditemukan." });
  }
  return res.sendFile(path.join(clientDist, "index.html"));
});

// Error Handling Middleware
app.use((error, req, res, next) => {
  if (error.name === "ZodError") {
    return res
      .status(422)
      .json({ message: "Data tidak valid.", issues: error.issues });
  }
  console.error(error);
  return res.status(500).json({ message: "Terjadi kesalahan server." });
});

// 3. Log Port yang dinamis dan tidak membingungkan saat di lokal
app.listen(port, () => {
  console.log(`Dental clinic API running on port: ${port}`);
});
