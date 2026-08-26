import AuditLog from "../models/AuditLog.js";

export async function writeAudit(req, action, entityType, entityId, details) {
  try {
    await AuditLog.create({
      user: req.session?.user?.id || null,
      userName: req.session?.user?.name || "האתר",
      action,
      entityType,
      entityId,
      details,
    });
  } catch {
    /* תקלה בתיעוד אינה מבטלת פעולה שבוצעה */
  }
}
