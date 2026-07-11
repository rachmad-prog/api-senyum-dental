import jwt from "jsonwebtoken";
import { getCurrentLicense } from "../services/license.js";

export function requireAuth(roles = ["owner", "admin"]) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Token tidak ditemukan." });
    }

    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      if (!roles.includes(user.role)) {
        return res.status(403).json({ message: "Role tidak memiliki akses." });
      }
      req.user = user;
      return next();
    } catch {
      return res.status(401).json({ message: "Token tidak valid." });
    }
  };
}

export function requireActiveLicense(options = {}) {
  const { allowOwner = false } = options;

  return async (req, res, next) => {
    try {
      const license = await getCurrentLicense();
      if (license.active || (allowOwner && req.user?.role === "owner")) {
        req.license = license;
        return next();
      }

      return res.status(402).json({
        message: "Token license sudah habis masa tenggang. Silakan login sebagai owner untuk memperbarui token license.",
        license
      });
    } catch (error) {
      return next(error);
    }
  };
}
