import { Router } from "express";
import Appointment from "../models/Appointment.js";
import { requireAuth } from "../middleware/auth.js";
import { formatPhone } from "../utils/phone.js";

const router = Router();
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

router.get("/appointments.csv", requireAuth, async (_req, res) => {
  const appointments = await Appointment.find()
    .populate("serviceIds")
    .sort({ date: 1, startTime: 1 });
  const rows = [
    [
      "תאריך",
      "שעה",
      "שעת סיום",
      "לקוחה",
      "טלפון",
      "טיפולים",
      "סטטוס",
      "מקור",
      "הערות",
    ],
    ...appointments.map((item) => [
      item.date,
      item.startTime,
      item.endTime,
      item.customerName,
      formatPhone(item.phone),
      item.serviceIds.map((service) => service.name).join("; "),
      item.status,
      item.source,
      item.notes,
    ]),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=appointments.csv");
  res.send(`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`);
});

router.get("/clients.csv", requireAuth, async (_req, res) => {
  const appointments = await Appointment.find().sort({
    date: -1,
    startTime: -1,
  });
  const clients = new Map();
  appointments.forEach((item) => {
    if (!clients.has(item.phone))
      clients.set(item.phone, {
        name: item.customerName,
        phone: item.phone,
        count: 0,
        last: item.date,
      });
    clients.get(item.phone).count += 1;
  });
  const rows = [
    ["שם לקוחה", "טלפון", "מספר תורים", "תור אחרון"],
    ...[...clients.values()].map((item) => [
      item.name,
      formatPhone(item.phone),
      item.count,
      item.last,
    ]),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=clients.csv");
  res.send(`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`);
});
export default router;
