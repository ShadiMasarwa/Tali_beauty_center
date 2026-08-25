import { Router } from "express";
import Appointment from "../models/Appointment.js";
import Service from "../models/Service.js";
import Settings from "../models/Settings.js";
import { requireAuth } from "../middleware/auth.js";
import { isValidPhone, normalizePhone } from "../utils/phone.js";
import {
  overlaps,
  toMinutes,
  toTime,
  totalReservedMinutes,
} from "../utils/time.js";
import { writeAudit } from "../services/audit.js";

const router = Router();
const israelDate = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(
    new Date(),
  );
const israelMinutes = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date())
    .split(":")
    .map(Number);
  return parts[0] * 60 + parts[1];
};

async function calculateSlot(body, ignoredId = null) {
  const services = await Service.find({
    _id: { $in: body.serviceIds },
    active: true,
  });
  if (!services.length || services.length !== body.serviceIds.length)
    return { error: "יש לבחור טיפולים תקינים" };
  const duration = totalReservedMinutes(services);
  const start = toMinutes(body.startTime);
  const end = start + duration;
  // האיסור על שעה שחלפה חל רק בקביעת תור חדש.
  // בעדכון תור קיים חייבים לאפשר שינוי שם, הערות, טיפולים או סטטוס גם לאחר שהטיפול התחיל.
  if (!ignoredId && body.date === israelDate() && start < israelMinutes())
    return { error: "לא ניתן לקבוע תור בשעה שכבר חלפה" };
  const settings = await Settings.findOne({ key: "salon" });
  const day = new Date(`${body.date}T12:00:00Z`).getUTCDay();
  const hours = settings?.workingHours.find((item) => item.day === day);
  if (
    !hours?.active ||
    start < toMinutes(hours.start) ||
    end > toMinutes(hours.end)
  )
    return { error: "המועד מחוץ לשעות הפעילות" };
  if (
    settings.closures.some(
      (item) =>
        item.date === body.date &&
        overlaps(start, end, toMinutes(item.start), toMinutes(item.end)),
    )
  )
    return { error: "המועד חסום ביומן" };
  const existing = await Appointment.find({
    date: body.date,
    status: { $ne: "cancelled" },
    ...(ignoredId ? { _id: { $ne: ignoredId } } : {}),
  });
  if (
    existing.some((item) =>
      overlaps(start, end, toMinutes(item.startTime), toMinutes(item.endTime)),
    )
  )
    return { error: "המועד מתנגש בתור קיים" };
  return { services, duration, endTime: toTime(end) };
}

router.get("/", requireAuth, async (req, res) => {
  const filter = {};
  if (req.query.from || req.query.to)
    filter.date = {
      ...(req.query.from ? { $gte: req.query.from } : {}),
      ...(req.query.to ? { $lte: req.query.to } : {}),
    };
  res.json(
    await Appointment.find(filter)
      .populate("serviceIds")
      .sort({ date: 1, startTime: 1 }),
  );
});
router.get("/public-calendar", async (_req, res) => {
  const appointments = await Appointment.find({ status: { $ne: "cancelled" } })
    .select("date startTime endTime status")
    .sort({ date: 1, startTime: 1 });
  res.json(appointments);
});
router.post("/availability", async (req, res) => {
  const settings = await Settings.findOne({ key: "salon" });
  const services = await Service.find({
    _id: { $in: req.body.serviceIds },
    active: true,
  });
  if (!settings || services.length !== req.body.serviceIds.length)
    return res.json([]);
  const day = new Date(`${req.body.date}T12:00:00Z`).getUTCDay();
  const hours = settings.workingHours.find((item) => item.day === day);
  if (!hours?.active) return res.json([]);
  const duration = totalReservedMinutes(services);
  const appointments = await Appointment.find({
    date: req.body.date,
    status: { $ne: "cancelled" },
    ...(req.body.excludeAppointmentId && req.session.user
      ? { _id: { $ne: req.body.excludeAppointmentId } }
      : {}),
  });
  const closures = settings.closures.filter(
    (item) => item.date === req.body.date,
  );
  const slots = [];
  for (
    let start = toMinutes(hours.start);
    start + duration <= toMinutes(hours.end);
    start += 15
  ) {
    if (req.body.date === israelDate() && start < israelMinutes()) continue;
    if (
      appointments.some((item) =>
        overlaps(
          start,
          start + duration,
          toMinutes(item.startTime),
          toMinutes(item.endTime),
        ),
      )
    )
      continue;
    if (
      closures.some((item) =>
        overlaps(
          start,
          start + duration,
          toMinutes(item.start),
          toMinutes(item.end),
        ),
      )
    )
      continue;
    slots.push(toTime(start));
  }
  res.json(slots);
});
router.post("/", async (req, res) => {
  if (!req.body.customerName?.trim() || !isValidPhone(req.body.phone))
    return res.status(400).json({ message: "שם או מספר הטלפון אינם תקינים" });
  const slot = await calculateSlot(req.body);
  if (slot.error) return res.status(409).json({ message: slot.error });
  // מסך הלקוחה עשוי להיפתח באותו דפדפן שבו קיימת התחברות ניהולית.
  // לכן מקור מפורש של מסך הלקוחה קודם לקיום ה-Session.
  const source =
    req.body.bookingOrigin === "customer"
      ? "website"
      : req.session.user
        ? "manual"
        : "website";
  const {
    bookingOrigin,
    source: _ignoredSource,
    ...appointmentData
  } = req.body;
  const appointment = await Appointment.create({
    ...appointmentData,
    phone: normalizePhone(req.body.phone),
    endTime: slot.endTime,
    source,
    createdBy: source === "manual" ? req.session.user.id : null,
  });
  await writeAudit(
    req,
    source === "manual" ? "הוספת תור ידני" : "קביעת תור מהאתר",
    "appointment",
    appointment.id,
    `${appointment.customerName} ${appointment.date} ${appointment.startTime}`,
  );
  req.app
    .get("io")
    .emit("appointments:changed", { action: "created", id: appointment.id });
  res.status(201).json(await appointment.populate("serviceIds"));
});
router.patch("/:id", requireAuth, async (req, res) => {
  if (!req.body.customerName?.trim() || !isValidPhone(req.body.phone))
    return res.status(400).json({ message: "שם או מספר הטלפון אינם תקינים" });
  const slot = await calculateSlot(req.body, req.params.id);
  if (slot.error) return res.status(409).json({ message: slot.error });
  // עדכון פרטי תור אינו משנה את המקור שבו התור נוצר.
  const {
    bookingOrigin,
    source: _ignoredSource,
    ...appointmentData
  } = req.body;
  const appointment = await Appointment.findByIdAndUpdate(
    req.params.id,
    {
      ...appointmentData,
      phone: normalizePhone(req.body.phone),
      endTime: slot.endTime,
    },
    { returnDocument: "after" },
  ).populate("serviceIds");
  await writeAudit(
    req,
    "עדכון תור",
    "appointment",
    appointment.id,
    `${appointment.customerName} ${appointment.status}`,
  );
  req.app
    .get("io")
    .emit("appointments:changed", { action: "updated", id: appointment.id });
  res.json(appointment);
});
router.patch("/:id/status", requireAuth, async (req, res) => {
  if (
    !["scheduled", "completed", "no_show", "cancelled"].includes(
      req.body.status,
    )
  )
    return res.status(400).json({ message: "סטטוס לא תקין" });
  const appointment = await Appointment.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { returnDocument: "after" },
  ).populate("serviceIds");
  if (!appointment) return res.status(404).json({ message: "התור לא נמצא" });
  await writeAudit(
    req,
    "שינוי סטטוס תור",
    "appointment",
    appointment.id,
    `${appointment.customerName}: ${appointment.status}`,
  );
  req.app
    .get("io")
    .emit("appointments:changed", { action: "status", id: appointment.id });
  res.json(appointment);
});
router.delete("/:id", requireAuth, async (req, res) => {
  const appointment = await Appointment.findByIdAndDelete(req.params.id);
  await writeAudit(
    req,
    "מחיקת תור",
    "appointment",
    req.params.id,
    appointment?.customerName || "",
  );
  req.app
    .get("io")
    .emit("appointments:changed", { action: "deleted", id: req.params.id });
  res.json({ success: true });
});
export default router;
