import { Router } from "express";
import Service from "../models/Service.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.js";

const router = Router();
router.get("/", async (_req, res) =>
  res.json(await Service.find({ active: true }).sort({ createdAt: 1 })),
);
router.patch("/:id", requireAuth, async (req, res) => {
  const service = await Service.findByIdAndUpdate(
    req.params.id,
    { durationMinutes: Number(req.body.durationMinutes) },
    { returnDocument: "after", runValidators: true },
  );
  await writeAudit(req, "עדכון טיפול", "service", service.id, service.name);
  res.json(service);
});
export default router;
