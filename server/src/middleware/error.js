export function errorHandler(error, _req, res, _next) {
  console.error(error);
  if (error.code === 11000)
    return res.status(409).json({ message: "הערך כבר קיים במערכת" });
  res.status(500).json({ message: "אירעה תקלה בשרת" });
}
