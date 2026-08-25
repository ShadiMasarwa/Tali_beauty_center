import { Router } from "express";
import AuditLog from "../models/AuditLog.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.get("/", requireAuth, async (_req, res) => res.json(await AuditLog.find().sort({ createdAt: -1 }).limit(250)));
export default router;
