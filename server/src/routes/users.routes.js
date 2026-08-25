import { Router } from "express";
import bcrypt from "bcrypt";
import User from "../models/User.js";
import { requireAuth, requireManager } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.js";

const router = Router();
router.get("/", requireAuth, async (_req, res) =>
  res.json(await User.find({ active: true }).select("name username role")),
);
router.post("/", requireManager, async (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || String(password).length < 8)
    return res.status(400).json({ message: "פרטי העובדת אינם תקינים" });
  const user = await User.create({
    name,
    username,
    passwordHash: await bcrypt.hash(password, 12),
    role: "employee",
  });
  await writeAudit(req, "הוספת עובדת", "user", user.id, user.name);
  res.status(201).json({
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
  });
});
router.patch("/:id", requireManager, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const username = String(req.body.username || "")
    .trim()
    .toLowerCase();
  if (!name || !username)
    return res.status(400).json({ message: "שם ושם משתמש הם שדות חובה" });
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { name, username },
    { returnDocument: "after" },
  ).select("name username role");
  if (!user) return res.status(404).json({ message: "המשתמשת לא נמצאה" });
  await writeAudit(req, "עדכון פרטי עובדת", "user", user.id, user.name);
  res.json(user);
});
router.delete("/:id", requireManager, async (req, res) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: { $ne: "manager" } },
    { active: false },
    { returnDocument: "after" },
  );
  if (!user) return res.status(400).json({ message: "לא ניתן למחוק משתמש זה" });
  await writeAudit(req, "מחיקת עובדת", "user", user.id, user.name);
  res.json({ success: true });
});
router.patch("/:id/password", requireManager, async (req, res) => {
  if (String(req.body.password || "").length < 8)
    return res
      .status(400)
      .json({ message: "הסיסמה חייבת להכיל לפחות 8 תווים" });
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { passwordHash: await bcrypt.hash(req.body.password, 12) },
    { returnDocument: "after" },
  );
  if (!user) return res.status(404).json({ message: "המשתמשת לא נמצאה" });
  await writeAudit(req, "איפוס סיסמת עובדת", "user", user.id, user.name);
  res.json({ success: true });
});
export default router;
