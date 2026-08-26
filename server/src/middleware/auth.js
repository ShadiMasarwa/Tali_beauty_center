export function requireAuth(req, res, next) {
  if (!req.session.user)
    return res.status(401).json({ message: "נדרשת התחברות" });
  next();
}
export function requireManager(req, res, next) {
  if (!req.session.user)
    return res.status(401).json({ message: "נדרשת התחברות" });
  if (req.session.user.role !== "manager")
    return res.status(403).json({ message: "הפעולה מותרת למנהלת בלבד" });
  next();
}
