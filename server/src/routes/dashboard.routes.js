import { Router } from "express";
import Appointment from "../models/Appointment.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.get("/", requireAuth, async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || "")
    ? req.query.month
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jerusalem",
        year: "numeric",
        month: "2-digit",
      })
        .format(new Date())
        .slice(0, 7);
  const appointments = await Appointment.find({
    date: { $gte: `${month}-01`, $lte: `${month}-31` },
  }).populate("serviceIds");
  const byStatus = ["scheduled", "completed", "no_show", "cancelled"].map(
    (status) => ({
      status,
      count: appointments.filter((item) => item.status === status).length,
    }),
  );
  const counted = appointments.filter((item) =>
    ["scheduled", "completed"].includes(item.status),
  );
  const serviceCounts = {};
  counted.forEach((appointment) =>
    appointment.serviceIds.forEach((service) => {
      serviceCounts[service.name] = (serviceCounts[service.name] || 0) + 1;
    }),
  );
  const byService = Object.entries(serviceCounts).map(([name, count]) => ({
    name,
    count,
  }));
  const bySource = ["website", "manual"].map((source) => ({
    source,
    count: appointments.filter((item) => item.source === source).length,
  }));
  res.json({
    month,
    total: appointments.length,
    byStatus,
    byService,
    bySource,
  });
});
export default router;
