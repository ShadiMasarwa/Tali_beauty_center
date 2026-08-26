import { Router } from "express";
import bcrypt from "bcrypt";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/login", async (req, res) => {
  const username = String(req.body.username || "")
    .trim()
    .toLowerCase();
  const user = await User.findOne({ username, active: true });
  if (
    !user ||
    !(await bcrypt.compare(String(req.body.password || ""), user.passwordHash))
  )
    return res.status(401).json({ message: "שם המשתמש או הסיסמה אינם נכונים" });
  req.session.user = {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
  };
  res.json({ user: req.session.user });
});

router.get("/me", (req, res) => res.json({ user: req.session.user || null }));
router.post("/logout", requireAuth, (req, res) =>
  req.session.destroy(() => res.json({ success: true })),
);
router.patch("/password", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.user.id);
  if (
    !user ||
    !(await bcrypt.compare(
      String(req.body.currentPassword || ""),
      user.passwordHash,
    ))
  )
    return res.status(400).json({ message: "הסיסמה הנוכחית אינה נכונה" });
  if (String(req.body.newPassword || "").length < 8)
    return res
      .status(400)
      .json({ message: "הסיסמה החדשה חייבת להכיל לפחות 8 תווים" });
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  await user.save();
  res.json({ success: true });
});
export default router;
