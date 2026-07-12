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
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      const isLocalDev = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(
        origin || "",
      );
      if (!origin || allowedOrigins.includes(origin) || isLocalDev) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
  }),
);
app.use(express.json({ limit: "8mb" }));

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api", publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use(express.static(clientDist));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ message: "Endpoint tidak ditemukan." });
  }
  return res.sendFile(path.join(clientDist, "index.html"));
});

app.use((error, req, res, next) => {
  if (error.name === "ZodError") {
    return res
      .status(422)
      .json({ message: "Data tidak valid.", issues: error.issues });
  }
  console.error(error);
  return res.status(500).json({ message: "Terjadi kesalahan server." });
});

app.listen(port, () => {
  console.log(
    `Dental clinic API running on https://senyum-dental.vercel.app:${port}`,
  );
});
