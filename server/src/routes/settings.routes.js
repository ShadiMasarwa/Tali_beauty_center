import { Router } from "express";
import Settings from "../models/Settings.js";
import { requireManager } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.js";

const router = Router();
router.get("/", async (_req, res) => res.json(await Settings.findOne({ key: "salon" })));
router.patch("/", requireManager, async (req, res) => {
  const update = {};
  if (Array.isArray(req.body.workingHours)) update.workingHours = req.body.workingHours;
  if (Array.isArray(req.body.closures)) update.closures = req.body.closures;
  const settings = await Settings.findOneAndUpdate({ key: "salon" }, update, { new: true, upsert: true });
  await writeAudit(req, "עדכון הגדרות", "settings", settings.id, Object.keys(update).join(", "));
  res.json(settings);
});
export default router;
