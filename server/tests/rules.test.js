import assert from "node:assert/strict";
import test from "node:test";
import { formatPhone, isValidPhone, normalizePhone } from "../src/utils/phone.js";
import { overlaps, totalReservedMinutes } from "../src/utils/time.js";

test("מספר טלפון נשמר ללא מקפים", () => assert.equal(normalizePhone("052-123-4567"), "0521234567"));
test("בדיקת טלפון נייד וקווי", () => { assert.equal(isValidPhone("052-123-4567"), true); assert.equal(isValidPhone("09-123-4567"), true); assert.equal(isValidPhone("052-123"), false); });
test("עיצוב מספר להצגה", () => assert.equal(formatPhone("0521234567"), "052-123-4567"));
test("חישוב משך כולל מרווח לכל טיפול", () => assert.equal(totalReservedMinutes([{ durationMinutes: 45 }, { durationMinutes: 50 }]), 105));
test("זיהוי התנגשות ושמירה על גבול משותף", () => { assert.equal(overlaps(600, 660, 650, 700), true); assert.equal(overlaps(600, 660, 660, 700), false); });
test("מקפים אינם משפיעים על תקינות מספר", () => { assert.equal(isValidPhone("0521234567"), true); assert.equal(isValidPhone("09-1234567"), true); });
test("מספר נייד חייב להכיל עשר ספרות", () => { assert.equal(isValidPhone("052123456"), false); assert.equal(isValidPhone("05212345678"), false); });
test("מספר שאינו נייד חייב להכיל תשע ספרות", () => { assert.equal(isValidPhone("09123456"), false); assert.equal(isValidPhone("0912345678"), false); });
test("כמה טיפולים מקבלים מרווח נפרד", () => assert.equal(totalReservedMinutes([{ durationMinutes: 30 }, { durationMinutes: 30 }, { durationMinutes: 30 }]), 105));
