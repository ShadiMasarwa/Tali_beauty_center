import "dotenv/config";
import bcrypt from "bcrypt";
import { connectDatabase } from "./config/db.js";
import Service from "./models/Service.js";
import User from "./models/User.js";
import Settings from "./models/Settings.js";

await connectDatabase();
const services = [
  ["haircut", "תספורת", 45, "#b8797b"], ["styling", "עיצוב שיער", 60, "#9a73ad"],
  ["manicure", "מניקור", 50, "#d59aaa"], ["pedicure", "פדיקור", 60, "#c99a72"],
  ["peeling", "פילינג", 40, "#78a6a0"], ["wax", "הסרת שיער", 35, "#d4ae65"],
  ["facial", "טיפול פנים", 75, "#6f8fbd"], ["bride", "חבילת כלה", 240, "#8b7a9b"],
];
for (const [code, name, durationMinutes, color] of services) await Service.updateOne({ code }, { code, name, durationMinutes, color, active: true }, { upsert: true });
await Settings.updateOne({ key: "salon" }, { key: "salon", workingHours: [
  { day: 0, active: true, start: "09:00", end: "18:00" }, { day: 1, active: true, start: "09:00", end: "18:00" },
  { day: 2, active: true, start: "09:00", end: "18:00" }, { day: 3, active: true, start: "09:00", end: "18:00" },
  { day: 4, active: true, start: "09:00", end: "18:00" }, { day: 5, active: true, start: "09:00", end: "14:00" },
  { day: 6, active: false, start: "09:00", end: "18:00" },
], closures: [] }, { upsert: true });
const initialPassword = String(process.env.INITIAL_ADMIN_PASSWORD || "");
if (initialPassword.length < 8) throw new Error("יש להגדיר INITIAL_ADMIN_PASSWORD באורך 8 תווים לפחות בקובץ server/.env");
const passwordHash = await bcrypt.hash(initialPassword, 12);
await User.updateOne({ username: "tali" }, { name: "טלי", username: "tali", passwordHash, role: "manager", active: true }, { upsert: true });
console.log("נתוני האתחול נוספו. משתמשת מנהלת: tali");
process.exit(0);
