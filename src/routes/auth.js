import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { query } from "../db/pool.js";

const router = Router();
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(6) });

router.post("/login", async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await query("SELECT * FROM users WHERE email = $1", [data.email.toLowerCase()]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(data.password, user.password_hash))) {
      return res.status(401).json({ message: "Email atau password salah." });
    }

    const publicUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token = jwt.sign(publicUser, process.env.JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, user: publicUser });
  } catch (error) {
    next(error);
  }
});

export default router;
