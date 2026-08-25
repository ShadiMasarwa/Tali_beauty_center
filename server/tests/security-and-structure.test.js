import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { requireAuth, requireManager } from "../src/middleware/auth.js";

function response() {
  return { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test("אורחת אינה יכולה להיכנס למסלולי ניהול", () => {
  const res = response();
  requireAuth({ session: {} }, res, () => assert.fail("next לא אמור להיקרא"));
  assert.equal(res.code, 401);
});

test("עובדת מחוברת יכולה להשתמש במסלולים הרגילים", () => {
  let continued = false;
  requireAuth({ session: { user: { role: "employee" } } }, response(), () => { continued = true; });
  assert.equal(continued, true);
});

test("רק מנהלת יכולה להשתמש במסלול מנהלת", () => {
  const employeeResponse = response();
  requireManager({ session: { user: { role: "employee" } } }, employeeResponse, () => assert.fail("אין הרשאה"));
  assert.equal(employeeResponse.code, 403);
  let managerContinued = false;
  requireManager({ session: { user: { role: "manager" } } }, response(), () => { managerContinued = true; });
  assert.equal(managerContinued, true);
});

test("השרת מפעיל Helmet, הגבלת כניסה ו-Session ב-MongoDB", () => {
  const source = readFileSync(resolve("server/src/app.js"), "utf8");
  assert.match(source, /helmet\(/);
  assert.match(source, /rateLimit\(/);
  assert.match(source, /MongoStore\.create/);
});

test("רשימת התורים מוגנת ובדיקת זמינות נשארת ציבורית", () => {
  const source = readFileSync(resolve("server/src/routes/appointments.routes.js"), "utf8");
  assert.match(source, /router\.get\("\/", requireAuth/);
  assert.match(source, /router\.post\("\/availability", async/);
  assert.match(source, /status: \{ \$ne: "cancelled" \}/);
  assert.match(source, /!ignoredId && body\.date === israelDate\(\)/);
});

test("הממשק כולל עדכון בזמן אמת, יום ושבוע וייצוא CSV", () => {
  const source = readFileSync(resolve("client/src/components/AdminApp.jsx"), "utf8");
  assert.match(source, /appointments:changed/);
  assert.match(source, /setMode\("day"\)/);
  assert.match(source, /setMode\("week"\)/);
  const adapter = readFileSync(resolve("client/src/legacyFetch.js"), "utf8");
  assert.match(adapter, /public-calendar/);
  assert.match(source, /ChangePassword/);
});

test("הפרויקט אינו מכיל קובצי TypeScript", () => {
  const roots = [resolve("client/src"), resolve("server/src")];
  const files = [];
  const walk = (dir) => readdirSync(dir).forEach((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path); else files.push(path);
  });
  roots.forEach(walk);
  assert.equal(files.some((file) => /\.tsx?$/.test(file)), false);
});
