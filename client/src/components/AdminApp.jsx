"use client";

import { Component, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { legacyFetch } from "../legacyFetch.js";

const serviceCatalog = [
  { id: "haircut", name: "תספורת", minutes: 45 },
  { id: "styling", name: "עיצוב שיער", minutes: 60 },
  { id: "manicure", name: "מניקור", minutes: 50 },
  { id: "pedicure", name: "פדיקור", minutes: 60 },
  { id: "peeling", name: "פילינג", minutes: 40 },
  { id: "wax", name: "הסרת שיער", minutes: 35 },
  { id: "facial", name: "טיפול פנים", minutes: 75 },
  { id: "bride", name: "חבילת כלה", minutes: 240 },
];

function treatmentTone(serviceId) {
  return (
    {
      haircut: "treatment-haircut",
      styling: "treatment-styling",
      manicure: "treatment-manicure",
      pedicure: "treatment-pedicure",
      peeling: "treatment-peeling",
      wax: "treatment-wax",
      facial: "treatment-facial",
      bride: "treatment-bride",
    }[serviceId] || "treatment-default"
  );
}

// כל התאריכים והשעות במערכת מוצגים לפי שעון ישראל, גם אם הגולשת בחו״ל.
const ISRAEL_TIME_ZONE = "Asia/Jerusalem";

function getIsraelNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISRAEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const hour = Number(value.hour);
  const minute = Number(value.minute);
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    time: `${value.hour}:${value.minute}`,
    minutes: hour * 60 + minute,
  };
}

function israelToday() {
  return getIsraelNow().date;
}

function israelTimeHHMM() {
  return getIsraelNow().time;
}

function greetingForIsraelTime(minutes) {
  const hour = Math.floor(minutes / 60);
  if (hour < 5) return "לילה טוב";
  if (hour < 12) return "בוקר טוב";
  if (hour < 15) return "צהריים טובים";
  if (hour < 18) return "אחר צהריים טובים";
  return "ערב טוב";
}

function addDays(dateKey, amount) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(time) {
  const [hour, minute] = String(time || "00:00")
    .split(":")
    .map(Number);
  return (
    (Number.isFinite(hour) ? hour : 0) * 60 +
    (Number.isFinite(minute) ? minute : 0)
  );
}

function minutesToTime(total) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function slotPosition(time) {
  const value = timeToMinutes(time);
  if (value < 10 * 60) return 0;
  if (value < 12 * 60 + 30) return 1;
  if (value < 15 * 60) return 2;
  return 3;
}

function appointmentPosition(appointment) {
  const calendarStart = 8 * 60;
  const calendarDuration = 10 * 60;
  const start = Math.max(calendarStart, timeToMinutes(appointment.time));
  const end = Math.min(
    calendarStart + calendarDuration,
    timeToMinutes(appointment.end),
  );
  return {
    top: `${((start - calendarStart) / calendarDuration) * 100}%`,
    height: `${Math.max(((end - start) / calendarDuration) * 100, 3.5)}%`,
  };
}

const CALENDAR_START = 8 * 60;
const CALENDAR_END = 18 * 60;
const CALENDAR_DURATION = CALENDAR_END - CALENDAR_START;

// מחזיר רצפים חסומים ביומן ומאחד רצפים סמוכים בעלי אותה סיבה.
function blockedPeriodsForDate(date, workingHours, closures) {
  const [year, month, day] = date.split("-").map(Number);
  const weekDay = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  const dayHours = workingHours[weekDay];
  const candidates = [];

  if (!dayHours?.active) {
    candidates.push({
      start: CALENDAR_START,
      end: CALENDAR_END,
      reason: "המכון אינו פעיל ביום זה",
      priority: 1,
    });
  } else {
    const workStart = timeToMinutes(dayHours.start);
    const workEnd = timeToMinutes(dayHours.end);
    if (workStart > CALENDAR_START)
      candidates.push({
        start: CALENDAR_START,
        end: Math.min(workStart, CALENDAR_END),
        reason: "מחוץ לשעות הפעילות",
        priority: 1,
      });
    if (workEnd < CALENDAR_END)
      candidates.push({
        start: Math.max(workEnd, CALENDAR_START),
        end: CALENDAR_END,
        reason: "מחוץ לשעות הפעילות",
        priority: 1,
      });
  }

  closures
    .filter((closure) => closure.date === date)
    .forEach((closure) => {
      candidates.push({
        start: Math.max(CALENDAR_START, timeToMinutes(closure.from)),
        end: Math.min(CALENDAR_END, timeToMinutes(closure.to)),
        reason: closure.reason?.trim() || "חסימה",
        priority: 2,
      });
    });

  const valid = candidates.filter((period) => period.end > period.start);
  const boundaries = [
    ...new Set(valid.flatMap((period) => [period.start, period.end])),
  ].sort((a, b) => a - b);
  const segments = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const covering = valid
      .filter((period) => period.start <= start && period.end >= end)
      .sort((a, b) => b.priority - a.priority)[0];
    if (!covering) continue;
    const previous = segments[segments.length - 1];
    if (previous?.end === start && previous.reason === covering.reason)
      previous.end = end;
    else segments.push({ start, end, reason: covering.reason });
  }
  return segments;
}

function BlockedTimeLayer({ date, workingHours, closures, compact = false }) {
  return blockedPeriodsForDate(date, workingHours, closures).map(
    (period, index) => (
      <div
        className={`blocked-time ${compact ? "compact" : ""}`}
        key={`${date}-${period.start}-${period.end}-${index}`}
        style={{
          top: `${((period.start - CALENDAR_START) / CALENDAR_DURATION) * 100}%`,
          height: `${((period.end - period.start) / CALENDAR_DURATION) * 100}%`,
        }}
      >
        <span>{period.reason}</span>
      </div>
    ),
  );
}

function statusClass(status) {
  return (
    {
      נקבע: "scheduled",
      הסתיים: "completed",
      "לא הופיעה": "no-show",
      בוטל: "cancelled",
    }[status] || "scheduled"
  );
}

function sanitizePhoneInput(value) {
  return value.replace(/[^\d-]/g, "").slice(0, 13);
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidPhone(value) {
  const digits = normalizePhone(value);
  return digits.startsWith("05") ? digits.length === 10 : digits.length === 9;
}

function formatPhone(value) {
  const digits = normalizePhone(value);
  if (digits.startsWith("05") && digits.length === 10)
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 9)
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return value;
}

function sourceLabel(source) {
  return source === "customer" ? "אתר" : "ידני";
}

function sourceClass(source) {
  return source === "customer" ? "website" : "manual";
}

function formatIsraelDate(dateKey, options = {}) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))
    ? String(dateKey)
    : israelToday();
  const [year, month, day] = safeDate.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: ISRAEL_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
    ...options,
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatWeekDay(dateKey) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))
    ? String(dateKey)
    : israelToday();
  const [year, month, day] = safeDate.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: ISRAEL_TIME_ZONE,
    weekday: "short",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

class AdminErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed)
      return (
        <main className="admin-recovery" dir="rtl">
          <section>
            <span className="eyebrow">מסך הניהול</span>
            <h1>לא הצלחנו להציג את היומן</h1>
            <p>המידע שלך נשמר. אפשר לטעון את המסך מחדש ולנסות שוב.</p>
            <button
              className="primary-btn"
              onClick={() => window.location.reload()}
            >
              טעינה מחדש
            </button>
          </section>
        </main>
      );
    return this.props.children;
  }
}

function AdminDashboard() {
  const [logged, setLogged] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [view, setView] = useState("calendar");
  const [selected, setSelected] = useState(null);
  const [appointmentSaveError, setAppointmentSaveError] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [israelNow, setIsraelNow] = useState(() => getIsraelNow());
  const today = israelNow.date;
  const [scheduledAppointments, setScheduledAppointments] = useState([]);
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [newBooking, setNewBooking] = useState({
    clientKey: "new",
    name: "",
    phone: "",
    notes: "",
    date: today,
    services: [],
    time: "",
  });
  const [services, setServices] = useState(serviceCatalog);
  const [employees, setEmployees] = useState([]);
  const [workingHours, setWorkingHours] = useState([
    { day: "ראשון", active: true, start: "09:00", end: "18:00" },
    { day: "שני", active: true, start: "09:00", end: "18:00" },
    { day: "שלישי", active: true, start: "09:00", end: "18:00" },
    { day: "רביעי", active: true, start: "09:00", end: "18:00" },
    { day: "חמישי", active: true, start: "09:00", end: "18:00" },
    { day: "שישי", active: true, start: "09:00", end: "14:00" },
    { day: "שבת", active: false, start: "09:00", end: "18:00" },
  ]);
  const [closures, setClosures] = useState([
    {
      id: 1,
      date: addDays(today, 10),
      from: "09:00",
      to: "18:00",
      reason: "חופשה",
    },
  ]);
  const [settingsSaved, setSettingsSaved] = useState(true);

  useEffect(() => {
    const refreshIsraelTime = () => setIsraelNow(getIsraelNow());
    refreshIsraelTime();
    const timer = setInterval(refreshIsraelTime, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!logged) return undefined;
    const socket = io(
      import.meta.env.VITE_SOCKET_URL || "http://localhost:5000",
    );
    const refresh = async () => {
      const response = await legacyFetch("/api/appointments", {
        cache: "no-store",
      });
      const data = await response.json();
      if (response.ok && Array.isArray(data.appointments))
        setScheduledAppointments(data.appointments);
    };
    socket.on("appointments:changed", refresh);
    return () => socket.disconnect();
  }, [logged]);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const response = await legacyFetch("/api/auth/session", {
          cache: "no-store",
        });
        const data = await response.json();
        if (!active || !response.ok || !data.employee) return;
        setCurrentUser(data.employee);
        setLogged(true);
        const employeesResponse = await legacyFetch("/api/employees", {
          cache: "no-store",
        });
        const employeesData = await employeesResponse.json();
        if (active && employeesResponse.ok)
          setEmployees(employeesData.employees || []);
      } catch {
        /* המשתמשת תוכל להתחבר דרך הטופס */
      } finally {
        if (active) setSessionChecking(false);
      }
    }
    restoreSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        const response = await legacyFetch("/api/settings", {
          cache: "no-store",
        });
        const data = await response.json();
        if (!active || !response.ok) return;
        const loadedServices = Array.isArray(data.settings.services)
          ? data.settings.services
              .filter((service) => service?.id && service?.name)
              .map((service) => ({
                ...service,
                minutes: Number(service.minutes) || 5,
              }))
          : serviceCatalog;
        const loadedHours = Array.isArray(data.settings.workingHours)
          ? data.settings.workingHours.slice(0, 7).map((hours, index) => ({
              day:
                hours?.day ||
                ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"][
                  index
                ],
              active: Boolean(hours?.active),
              start: /^\d{2}:\d{2}$/.test(hours?.start || "")
                ? hours.start
                : "09:00",
              end: /^\d{2}:\d{2}$/.test(hours?.end || "") ? hours.end : "18:00",
            }))
          : [];
        while (loadedHours.length < 7)
          loadedHours.push({
            day: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"][
              loadedHours.length
            ],
            active: false,
            start: "09:00",
            end: "18:00",
          });
        const loadedClosures = Array.isArray(data.settings.closures)
          ? data.settings.closures
              .filter((closure) =>
                /^\d{4}-\d{2}-\d{2}$/.test(closure?.date || ""),
              )
              .map((closure) => ({
                ...closure,
                id: closure.id || `closure-${closure.date}`,
                from: /^\d{2}:\d{2}$/.test(closure.from || "")
                  ? closure.from
                  : "08:00",
                to: /^\d{2}:\d{2}$/.test(closure.to || "")
                  ? closure.to
                  : "18:00",
                reason: closure.reason || "חופשה או חסימה",
              }))
          : [];
        setServices(loadedServices.length ? loadedServices : serviceCatalog);
        setWorkingHours(loadedHours);
        setClosures(loadedClosures);
      } catch {
        /* במקרה של תקלה נשארים ערכי ברירת המחדל */
      }
    }
    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  async function persistSetting(key, value) {
    setSettingsSaved(false);
    try {
      const response = await legacyFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!response.ok) throw new Error("שמירת ההגדרה נכשלה");
      setSettingsSaved(true);
    } catch {
      setSettingsSaved(false);
    }
  }

  function updatePersistentSetting(key, setter, change) {
    setter((current) => {
      const next = typeof change === "function" ? change(current) : change;
      queueMicrotask(() => persistSetting(key, next));
      return next;
    });
  }

  const updateServices = (change) =>
    updatePersistentSetting("services", setServices, change);
  const updateWorkingHours = (change) =>
    updatePersistentSetting("workingHours", setWorkingHours, change);
  const updateClosures = (change) =>
    updatePersistentSetting("closures", setClosures, change);

  useEffect(() => {
    let active = true;
    async function syncAppointments() {
      try {
        const response = await legacyFetch("/api/appointments", {
          cache: "no-store",
        });
        const data = await response.json();
        if (!active || !response.ok) return;
        const validAppointments = Array.isArray(data.appointments)
          ? data.appointments
              .filter(
                (appointment) =>
                  appointment?.id &&
                  /^\d{4}-\d{2}-\d{2}$/.test(appointment?.date || "") &&
                  /^\d{2}:\d{2}$/.test(appointment?.time || "") &&
                  /^\d{2}:\d{2}$/.test(appointment?.end || ""),
              )
              .map((appointment) => ({
                ...appointment,
                name: String(appointment.name || "לקוחה"),
                phone: String(appointment.phone || ""),
                services: String(appointment.services || ""),
                serviceIds: Array.isArray(appointment.serviceIds)
                  ? appointment.serviceIds
                  : [],
              }))
          : [];
        setScheduledAppointments(validAppointments);
      } catch {
        /* הסנכרון ינסה שוב אוטומטית */
      }
    }
    syncAppointments();
    const timer = setInterval(syncAppointments, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // לא מחשבים את נתוני היומן לפני שסיימנו לבדוק אם קיימת התחברות פעילה.
  // כך גם נתון ישן או חלקי אינו יכול להפיל את מסך הכניסה.
  if (sessionChecking)
    return (
      <main className="admin-loading" aria-live="polite">
        <div className="brand">
          <span>É</span>TALI
          <small>BEAUTY STUDIO</small>
        </div>
        <p>טוען את מסך הניהול…</p>
      </main>
    );
  if (!logged || !currentUser)
    return (
      <main className="login-page">
        <section className="login-brand">
          <a className="brand light" href="/">
            <span>É</span>TALI
            <small>BEAUTY STUDIO</small>
          </a>
          <div>
            <span>ניהול חכם. שירות אישי.</span>
            <h1>
              כל היום שלך,
              <br />
              במקום אחד.
            </h1>
            <p>יומן מסודר, לקוחות מרוצות, ויותר זמן לעשות את מה שאת אוהבת.</p>
          </div>
          <small>מערכת ניהול המכון של טלי</small>
        </section>
        <section className="login-form">
          <form onSubmit={login}>
            <span className="eyebrow">כניסת צוות</span>
            <h2>טוב לראות אותך</h2>
            <p>הזיני את פרטי הכניסה למערכת הניהול</p>
            <label>שם משתמש</label>
            <input
              required
              autoComplete="username"
              placeholder="שם המשתמש שלך"
              value={loginForm.username}
              onChange={(event) =>
                setLoginForm({ ...loginForm, username: event.target.value })
              }
            />
            <label>סיסמה</label>
            <input
              required
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={loginForm.password}
              onChange={(event) =>
                setLoginForm({ ...loginForm, password: event.target.value })
              }
            />
            {loginError && <div className="login-error">{loginError}</div>}
            <button className="primary-btn">
              כניסה למערכת <span>←</span>
            </button>
          </form>
        </section>
      </main>
    );

  const selectedServices = services.filter((service) =>
    newBooking.services.includes(service.id),
  );
  const existingClients = Object.values(
    scheduledAppointments.reduce((all, appointment) => {
      const phone = normalizePhone(appointment.phone);
      if (!phone) return all;
      const current = all[phone];
      if (!current || appointment.date >= current.lastDate)
        all[phone] = {
          phone,
          name: appointment.name,
          lastDate: appointment.date,
        };
      return all;
    }, {}),
  ).sort((first, second) =>
    String(first.name).localeCompare(String(second.name), "he"),
  );
  const treatmentMinutes = selectedServices.reduce(
    (sum, service) => sum + service.minutes,
    0,
  );
  const reservedMinutes = treatmentMinutes + selectedServices.length * 5;
  const dayAppointments = scheduledAppointments.filter(
    (appointment) =>
      appointment.date === newBooking.date && appointment.status !== "בוטל",
  );
  const [bookingYear, bookingMonth, bookingDay] = newBooking.date
    .split("-")
    .map(Number);
  const weekDayIndex = new Date(
    Date.UTC(bookingYear, bookingMonth - 1, bookingDay, 12),
  ).getUTCDay();
  const selectedDayHours = workingHours[weekDayIndex];
  const dayClosures = closures.filter(
    (closure) => closure.date === newBooking.date,
  );
  const workStart = selectedDayHours?.active
    ? timeToMinutes(selectedDayHours.start)
    : 0;
  const workEnd = selectedDayHours?.active
    ? timeToMinutes(selectedDayHours.end)
    : 0;
  const slotCount = Math.max(0, Math.floor((workEnd - workStart) / 15) + 1);
  const availableSlots =
    reservedMinutes && selectedDayHours?.active
      ? Array.from({ length: slotCount }, (_, index) => workStart + index * 15)
          .filter((start) => start + reservedMinutes <= workEnd)
          .filter(
            (start) =>
              newBooking.date !== israelNow.date || start >= israelNow.minutes,
          )
          .filter(
            (start) =>
              !dayAppointments.some(
                (appointment) =>
                  start < timeToMinutes(appointment.end) &&
                  start + reservedMinutes > timeToMinutes(appointment.time),
              ),
          )
          .filter(
            (start) =>
              !dayClosures.some(
                (closure) =>
                  start < timeToMinutes(closure.to) &&
                  start + reservedMinutes > timeToMinutes(closure.from),
              ),
          )
          .map(minutesToTime)
      : [];
  const editedServices = selected
    ? services.filter((service) =>
        (selected.serviceIds || []).includes(service.id),
      )
    : [];
  const editedTreatmentMinutes = editedServices.reduce(
    (sum, service) => sum + service.minutes,
    0,
  );
  const editedReservedMinutes =
    editedTreatmentMinutes + editedServices.length * 5;
  const editedStartMinutes = selected ? timeToMinutes(selected.time) : 0;
  const editedEndMinutes = editedStartMinutes + editedReservedMinutes;
  const selectedPhoneValid = selected ? isValidPhone(selected.phone) : true;
  const newPhoneValid = isValidPhone(newBooking.phone);
  const editConflict = selected
    ? scheduledAppointments
        .filter(
          (appointment) =>
            appointment.id !== selected.id &&
            appointment.date === selected.date &&
            appointment.status !== "בוטל",
        )
        .sort((first, second) =>
          String(first.time).localeCompare(String(second.time)),
        )
        .find(
          (appointment) =>
            editedStartMinutes < timeToMinutes(appointment.end) &&
            editedEndMinutes > timeToMinutes(appointment.time),
        )
    : null;

  async function login(event) {
    event.preventDefault();
    try {
      const response = await legacyFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "הכניסה נכשלה");
      setCurrentUser(data.employee);
      setLoginError("");
      setLogged(true);
      setView("calendar");
      setLoginForm({ username: "", password: "" });
      const employeesResponse = await legacyFetch("/api/employees", {
        cache: "no-store",
      });
      const employeesData = await employeesResponse.json();
      if (employeesResponse.ok) setEmployees(employeesData.employees || []);
    } catch (error) {
      setLoginError(error.message);
    }
  }

  async function logout() {
    try {
      await legacyFetch("/api/auth/session", { method: "DELETE" });
    } catch {
      /* היציאה המקומית ממשיכה */
    }
    setLogged(false);
    setCurrentUser(null);
    setEmployees([]);
    setView("calendar");
  }

  async function saveAppointment() {
    if (!selected.serviceIds?.length || editConflict || !selectedPhoneValid)
      return;
    setAppointmentSaveError("");
    const updated = {
      ...selected,
      phone: normalizePhone(selected.phone),
      services: editedServices.map((service) => service.name).join(" · "),
      end: minutesToTime(editedEndMinutes),
      tone: treatmentTone(editedServices[0].id),
    };
    try {
      const response = await legacyFetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "עדכון התור נכשל");
      setScheduledAppointments((current) =>
        current.map((appointment) =>
          appointment.id === selected.id ? data.appointment : appointment,
        ),
      );
    } catch (error) {
      setAppointmentSaveError(error.message || "לא ניתן לשמור את העדכון");
      return;
    }
    setDeleteArmed(false);
    setSelected(null);
  }

  async function deleteAppointment() {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setScheduledAppointments((current) =>
      current.filter((appointment) => appointment.id !== selected.id),
    );
    try {
      await legacyFetch("/api/appointments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id }),
      });
    } catch {
      /* הסנכרון הבא יתקן מצב זמני */
    }
    setDeleteArmed(false);
    setSelected(null);
  }

  function openAppointment(appointment) {
    setDeleteArmed(false);
    setAppointmentSaveError("");
    const serviceIds =
      appointment.serviceIds ||
      services
        .filter((service) => appointment.services.includes(service.name))
        .map((service) => service.id);
    setSelected({
      ...appointment,
      phone: formatPhone(appointment.phone),
      serviceIds,
    });
  }

  function toggleEditService(id) {
    setSelected((current) => ({
      ...current,
      serviceIds: current.serviceIds.includes(id)
        ? current.serviceIds.filter((serviceId) => serviceId !== id)
        : [...current.serviceIds, id],
    }));
  }

  function closeAppointment() {
    setDeleteArmed(false);
    setAppointmentSaveError("");
    setSelected(null);
  }

  function openNewBooking() {
    setNewBooking({
      clientKey: "new",
      name: "",
      phone: "",
      notes: "",
      date: today,
      services: [],
      time: "",
    });
    setShowNewBooking(true);
  }

  function chooseBookingClient(clientKey) {
    if (clientKey === "new") {
      setNewBooking((current) => ({
        ...current,
        clientKey,
        name: "",
        phone: "",
      }));
      return;
    }
    const client = existingClients.find((item) => item.phone === clientKey);
    if (client)
      setNewBooking((current) => ({
        ...current,
        clientKey,
        name: client.name,
        phone: formatPhone(client.phone),
      }));
  }

  function toggleNewService(id) {
    setNewBooking((current) => ({
      ...current,
      time: "",
      services: current.services.includes(id)
        ? current.services.filter((serviceId) => serviceId !== id)
        : [...current.services, id],
    }));
  }

  async function createAppointment(event) {
    event.preventDefault();
    if (
      !newBooking.name.trim() ||
      !newPhoneValid ||
      !newBooking.time ||
      !selectedServices.length
    )
      return;
    const start = timeToMinutes(newBooking.time);
    const currentIsraelNow = getIsraelNow();
    if (
      newBooking.date === currentIsraelNow.date &&
      start < currentIsraelNow.minutes
    ) {
      setNewBooking((current) => ({ ...current, time: "" }));
      return;
    }
    const appointment = {
      date: newBooking.date,
      time: newBooking.time,
      end: minutesToTime(start + reservedMinutes),
      name: newBooking.name.trim(),
      phone: normalizePhone(newBooking.phone),
      notes: newBooking.notes.trim() || "אין הערות מיוחדות.",
      services: selectedServices.map((service) => service.name).join(" · "),
      serviceIds: selectedServices.map((service) => service.id),
      status: "נקבע",
      source: "staff",
      tone: treatmentTone(selectedServices[0].id),
      pos: slotPosition(newBooking.time),
    };
    try {
      const response = await legacyFetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...appointment, source: "staff" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setScheduledAppointments((current) => [...current, data.appointment]);
    } catch {
      setScheduledAppointments((current) => [
        ...current,
        { ...appointment, id: `manual-${Date.now()}` },
      ]);
    }
    setShowNewBooking(false);
    setView("calendar");
  }

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <a className="brand light" href="/">
          <span>É</span>TALI
          <small>BEAUTY STUDIO</small>
        </a>
        <nav>
          <button
            className={view === "calendar" ? "active" : ""}
            onClick={() => setView("calendar")}
          >
            <i>▦</i> יומן תורים
          </button>
          <button
            className={view === "dashboard" ? "active" : ""}
            onClick={() => setView("dashboard")}
          >
            <i>◫</i> דשבורד
          </button>
          <button onClick={openNewBooking}>
            <i>＋</i> קביעת תור
          </button>
          <button
            className={view === "clients" ? "active" : ""}
            onClick={() => setView("clients")}
          >
            <i>♙</i> לקוחות
          </button>
          <button
            className={view === "services" ? "active" : ""}
            onClick={() => setView("services")}
          >
            <i>✦</i> טיפולים
          </button>
          <span>חשבון</span>
          <button
            className={view === "password" ? "active" : ""}
            onClick={() => setView("password")}
          >
            <i>⌁</i> שינוי סיסמה
          </button>
          <button
            className={view === "audit" ? "active" : ""}
            onClick={() => setView("audit")}
          >
            <i>≡</i> יומן פעילות
          </button>
          {currentUser?.role === "מנהלת" && (
            <>
              <span>ניהול</span>
              <button
                className={view === "employees" ? "active" : ""}
                onClick={() => setView("employees")}
              >
                <i>♧</i> עובדים
              </button>
              <button
                className={view === "hours" ? "active" : ""}
                onClick={() => setView("hours")}
              >
                <i>◷</i> שעות פעילות
              </button>
              <button
                className={view === "closures" ? "active" : ""}
                onClick={() => setView("closures")}
              >
                <i>○</i> חופשות וחסימות
              </button>
            </>
          )}
        </nav>
        <div className="user-card">
          <div>{String(currentUser?.name || "צ").slice(0, 1)}</div>
          <span>
            <strong>{currentUser?.name || "צוות המכון"}</strong>
            <small>{currentUser?.role || "עובדת"}</small>
          </span>
          <button onClick={logout}>↪</button>
        </div>
      </aside>
      <section className="admin-content">
        <header>
          <div>
            <span className="eyebrow">
              {formatWeekDay(today)}, {formatIsraelDate(today)}
            </span>
            <h1>
              {
                {
                  calendar: `${greetingForIsraelTime(israelNow.minutes)}, ${currentUser?.name}`,
                  dashboard: "תמונת מצב",
                  clients: "לקוחות",
                  services: "טיפולים",
                  employees: "ניהול עובדים",
                  hours: "שעות פעילות",
                  closures: "חופשות וחסימות",
                  password: "שינוי סיסמה",
                  audit: "יומן פעילות",
                }[view]
              }
            </h1>
            <p>
              {
                {
                  calendar: "הנה מה שמחכה לך היום במכון · שעון ישראל",
                  dashboard: "כל מה שקורה במכון, במספרים",
                  clients: "פרטי הלקוחות והתורים שלהן",
                  services: "משך הטיפולים והמרווחים ביומן",
                  employees: "הרשאות ופרטי הכניסה של צוות המכון",
                  hours: "הימים והשעות שבהם ניתן לקבוע תורים",
                  closures: "תאריכים ושעות שבהם המכון אינו מקבל תורים",
                  password: "עדכון סיסמת הכניסה האישית שלך",
                  audit: "תיעוד פעולות הצוות והשינויים שבוצעו במערכת",
                }[view]
              }
            </p>
          </div>
          <button className="new-booking" onClick={openNewBooking}>
            ＋ תור חדש
          </button>
        </header>
        {view === "calendar" && (
          <Calendar
            appointments={scheduledAppointments}
            workingHours={workingHours}
            closures={closures}
            onSelect={openAppointment}
          />
        )}
        {view === "dashboard" && (
          <Dashboard appointments={scheduledAppointments} services={services} />
        )}
        {view === "clients" && <Clients appointments={scheduledAppointments} />}
        {view === "services" && (
          <Services services={services} setServices={updateServices} />
        )}
        {view === "employees" && (
          <Employees employees={employees} setEmployees={setEmployees} />
        )}
        {view === "hours" && (
          <WorkingHours hours={workingHours} setHours={updateWorkingHours} />
        )}
        {view === "closures" && (
          <Closures
            closures={closures}
            setClosures={updateClosures}
            today={today}
          />
        )}
        {view === "password" && <ChangePassword currentUser={currentUser} />}
        {view === "audit" && <AuditLog />}
        {!settingsSaved && (
          <div className="settings-sync-note">
            שומר את השינויים במסד הנתונים…
          </div>
        )}
      </section>
      {selected && (
        <div className="modal-shade" onClick={closeAppointment}>
          <section
            className="appointment-modal edit-booking-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={closeAppointment}>
              ×
            </button>
            <span className="eyebrow">עדכון תור</span>
            <div className="modal-time">
              <span>
                {formatWeekDay(selected.date)},{" "}
                {formatIsraelDate(selected.date)}
              </span>
              <strong>
                {selected.time}—{minutesToTime(editedEndMinutes)}
              </strong>
            </div>
            <label>שם הלקוחה</label>
            <input
              value={selected.name}
              onChange={(e) =>
                setSelected({ ...selected, name: e.target.value })
              }
            />
            <label>מספר טלפון</label>
            <input
              inputMode="tel"
              value={selected.phone}
              onChange={(e) =>
                setSelected({
                  ...selected,
                  phone: sanitizePhoneInput(e.target.value),
                })
              }
              onBlur={() =>
                setSelected({ ...selected, phone: formatPhone(selected.phone) })
              }
            />
            {!selectedPhoneValid && (
              <div className="phone-error">
                מספר נייד שמתחיל ב־05 חייב להכיל 10 ספרות; מספר אחר חייב להכיל 9
                ספרות.
              </div>
            )}
            <label>טיפולים</label>
            <div className="admin-service-grid edit-services-grid">
              {services.map((service) => (
                <button
                  type="button"
                  key={service.id}
                  className={
                    selected.serviceIds.includes(service.id) ? "selected" : ""
                  }
                  onClick={() => toggleEditService(service.id)}
                >
                  <span>
                    {selected.serviceIds.includes(service.id) ? "✓" : "+"}
                  </span>
                  <strong>{service.name}</strong>
                  <small>{service.minutes} דק׳</small>
                </button>
              ))}
            </div>
            <div className="booking-duration">
              <span>
                משך הטיפולים: <strong>{editedTreatmentMinutes} דקות</strong>
              </span>
              <span>
                משבצת ביומן: <strong>{editedReservedMinutes} דקות</strong>
              </span>
            </div>
            {!selected.serviceIds.length && (
              <div className="login-error">יש לבחור טיפול אחד לפחות</div>
            )}
            {editConflict && (
              <div className="conflict-alert">
                <strong>לא ניתן לשמור — קיימת התנגשות</strong>
                <span>
                  התור המעודכן מסתיים בשעה {minutesToTime(editedEndMinutes)}, אך
                  התור של {editConflict.name} מתחיל בשעה {editConflict.time}.
                </span>
              </div>
            )}
            <label>הערות הלקוחה</label>
            <textarea
              rows="3"
              value={selected.notes || ""}
              onChange={(e) =>
                setSelected({ ...selected, notes: e.target.value })
              }
            />
            <label>סטטוס התור</label>
            <div className="status-choice-grid">
              {["נקבע", "הסתיים", "לא הופיעה", "בוטל"].map((status) => (
                <button
                  type="button"
                  key={status}
                  aria-pressed={selected.status === status}
                  className={`status-choice ${statusClass(status)} ${selected.status === status ? "selected" : ""}`}
                  onClick={() => setSelected({ ...selected, status })}
                >
                  <span>{selected.status === status ? "✓" : ""}</span>
                  <strong>{status}</strong>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button
                className={`danger ${deleteArmed ? "armed" : ""}`}
                onClick={deleteAppointment}
              >
                {deleteArmed ? "לחץ פעם נוספת למחיקה" : "מחיקת תור"}
              </button>
              <button
                className="primary-btn"
                disabled={
                  !selected.serviceIds.length ||
                  Boolean(editConflict) ||
                  !selectedPhoneValid
                }
                onClick={saveAppointment}
              >
                שמירת עדכון
              </button>
            </div>
          </section>
        </div>
      )}
      {showNewBooking && (
        <div className="modal-shade" onClick={() => setShowNewBooking(false)}>
          <form
            className="appointment-modal new-booking-modal"
            onSubmit={createAppointment}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setShowNewBooking(false)}
            >
              ×
            </button>
            <span className="eyebrow">קביעת תור ידנית</span>
            <h2>תור חדש</h2>
            <div className="client-picker">
              <label>שם הלקוחה *</label>
              <select
                value={newBooking.clientKey}
                onChange={(event) => chooseBookingClient(event.target.value)}
              >
                <option value="new">＋ הוספת לקוחה חדשה</option>
                {existingClients.map((client) => (
                  <option key={client.phone} value={client.phone}>
                    {client.name} · {formatPhone(client.phone)}
                  </option>
                ))}
              </select>
            </div>
            <div className="new-booking-grid">
              {newBooking.clientKey === "new" && (
                <div>
                  <label>שם לקוחה חדשה *</label>
                  <input
                    required
                    value={newBooking.name}
                    onChange={(event) =>
                      setNewBooking({ ...newBooking, name: event.target.value })
                    }
                    placeholder="שם מלא"
                  />
                </div>
              )}
              <div
                className={
                  newBooking.clientKey !== "new" ? "full-grid-field" : ""
                }
              >
                <label>מספר טלפון *</label>
                <input
                  required
                  inputMode="tel"
                  value={newBooking.phone}
                  onChange={(event) =>
                    setNewBooking({
                      ...newBooking,
                      phone: sanitizePhoneInput(event.target.value),
                    })
                  }
                  onBlur={() =>
                    setNewBooking({
                      ...newBooking,
                      phone: formatPhone(newBooking.phone),
                    })
                  }
                />
                {newBooking.phone && !newPhoneValid && (
                  <div className="phone-error">
                    מספר נייד שמתחיל ב־05 חייב להכיל 10 ספרות; מספר אחר חייב
                    להכיל 9 ספרות.
                  </div>
                )}
              </div>
            </div>
            <label>הערות</label>
            <textarea
              rows="2"
              value={newBooking.notes}
              onChange={(event) =>
                setNewBooking({ ...newBooking, notes: event.target.value })
              }
            />
            <label>טיפולים *</label>
            <div className="admin-service-grid">
              {services.map((service) => (
                <button
                  type="button"
                  key={service.id}
                  className={
                    newBooking.services.includes(service.id) ? "selected" : ""
                  }
                  onClick={() => toggleNewService(service.id)}
                >
                  <span>
                    {newBooking.services.includes(service.id) ? "✓" : "+"}
                  </span>
                  <strong>{service.name}</strong>
                  <small>{service.minutes} דק׳</small>
                </button>
              ))}
            </div>
            <div className="booking-duration">
              <span>
                משך הטיפול: <strong>{treatmentMinutes} דקות</strong>
              </span>
              <span>
                משבצת ביומן: <strong>{reservedMinutes} דקות</strong>
              </span>
            </div>
            <label>תאריך *</label>
            <input
              required
              type="date"
              min={today}
              value={newBooking.date}
              onChange={(event) =>
                setNewBooking({
                  ...newBooking,
                  date: event.target.value,
                  time: "",
                })
              }
            />
            <label>שעה פנויה *</label>
            {selectedServices.length ? (
              <div className="admin-slots">
                {availableSlots.length ? (
                  availableSlots.map((time) => (
                    <button
                      type="button"
                      key={time}
                      className={newBooking.time === time ? "selected" : ""}
                      onClick={() => setNewBooking({ ...newBooking, time })}
                    >
                      {time}
                    </button>
                  ))
                ) : (
                  <p>אין משבצת פנויה למשך הטיפולים שנבחרו.</p>
                )}
              </div>
            ) : (
              <p className="form-hint">
                יש לבחור טיפול אחד לפחות כדי לראות שעות פנויות.
              </p>
            )}
            <button
              className="primary-btn create-booking-btn"
              disabled={!newBooking.time || !newPhoneValid}
            >
              שמירת התור ביומן
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

export default function AdminApp() {
  return (
    <AdminErrorBoundary>
      <AdminDashboard />
    </AdminErrorBoundary>
  );
}

function Calendar({
  appointments: scheduledAppointments,
  workingHours,
  closures,
  onSelect,
}) {
  const today = israelToday();
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState("'week'");
  const [currentTime, setCurrentTime] = useState(israelTimeHHMM());
  useEffect(() => {
    const refreshClock = () => setCurrentTime(israelTimeHHMM());
    const timer = setInterval(refreshClock, 30000);
    return () => clearInterval(timer);
  }, []);
  const weekDates = Array.from({ length: 7 }, (_, index) =>
    addDays(date, index),
  );
  const step = mode === "week" ? 7 : 1;
  const visibleAppointments =
    mode === "day"
      ? scheduledAppointments.filter((appointment) => appointment.date === date)
      : scheduledAppointments.filter((appointment) =>
          weekDates.includes(appointment.date),
        );
  const nextAppointment = visibleAppointments[0];
  const currentIsraelTime = israelTimeHHMM();
  const nextToday = scheduledAppointments
    .filter(
      (appointment) =>
        appointment.date === today &&
        appointment.time >= currentIsraelTime &&
        appointment.status === "נקבע",
    )
    .sort((first, second) =>
      String(first.time).localeCompare(String(second.time)),
    )[0];

  return (
    <>
      <section className="stats-strip">
        <article>
          <span>תורים בתצוגה</span>
          <strong>{visibleAppointments.length}</strong>
          <small>◷ לפי התאריך שנבחר</small>
        </article>
        <article>
          <span>התור הראשון בתצוגה</span>
          <strong>{nextAppointment?.time || "—"}</strong>
          <small>
            {nextAppointment
              ? `${nextAppointment.name} · ${nextAppointment.services}`
              : "אין תורים בטווח זה"}
          </small>
        </article>
        <article>
          <span>התור הבא היום</span>
          <strong>{nextToday?.time || "—"}</strong>
          <small>
            {nextToday
              ? `${nextToday.name} · ${nextToday.services}`
              : "אין עוד תורים להיום"}
          </small>
        </article>
      </section>
      <section
        className={`calendar-card ${mode === "week" ? "week-mode" : ""}`}
      >
        <header>
          <div className="date-nav">
            <button
              aria-label={mode === "day" ? "היום הקודם" : "השבוע הקודם"}
              onClick={() => setDate(addDays(date, -step))}
            >
              ‹
            </button>
            <strong>
              {mode === "day"
                ? formatIsraelDate(date)
                : `${formatIsraelDate(date, { year: undefined })} — ${formatIsraelDate(addDays(date, 6))}`}
            </strong>
            <button
              aria-label={mode === "day" ? "היום הבא" : "השבוע הבא"}
              onClick={() => setDate(addDays(date, step))}
            >
              ›
            </button>
            <button className="today" onClick={() => setDate(today)}>
              היום
            </button>
          </div>
          <div className="view-switch">
            <button
              className={mode === "day" ? "active" : ""}
              onClick={() => setMode("day")}
            >
              יום
            </button>
            <button
              className={mode === "week" ? "active" : ""}
              onClick={() => setMode("week")}
            >
              שבוע
            </button>
          </div>
        </header>
        {mode === "day" ? (
          <DayCalendar
            date={date}
            currentTime={currentTime}
            workingHours={workingHours}
            closures={closures}
            appointmentsForDate={visibleAppointments}
            onSelect={onSelect}
          />
        ) : (
          <WeekCalendar
            dates={weekDates}
            currentTime={currentTime}
            workingHours={workingHours}
            closures={closures}
            appointmentsForWeek={visibleAppointments}
            onSelect={onSelect}
          />
        )}
      </section>
    </>
  );
}

const hours = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
];

function CurrentTimeIndicator({ time, compact = false }) {
  const start = 8 * 60;
  const end = 18 * 60;
  const minutes = timeToMinutes(time);
  if (minutes < start || minutes > end) return null;
  return (
    <div
      className={`current-time-indicator ${compact ? "compact" : ""}`}
      style={{ top: `${((minutes - start) / (end - start)) * 100}%` }}
      aria-label="מחוון השעה הנוכחית"
    ></div>
  );
}

function DayCalendar({
  date,
  currentTime,
  workingHours,
  closures,
  appointmentsForDate,
  onSelect,
}) {
  return (
    <div className="calendar-body">
      <div className="hours exact-hours">
        {hours.map((hour, index) => (
          <span key={hour} style={{ top: `${index * 10}%` }}>
            {hour}
          </span>
        ))}
      </div>
      <div className="timeline">
        <BlockedTimeLayer
          date={date}
          workingHours={workingHours}
          closures={closures}
        />
        {date === israelToday() && <CurrentTimeIndicator time={currentTime} />}
        {appointmentsForDate.length === 0 && (
          <div className="empty-calendar">
            <strong>אין תורים ביום זה</strong>
            <span>אפשר לעבור ליום אחר או לקבוע תור חדש</span>
          </div>
        )}
        {appointmentsForDate.map((appointment) => (
          <button
            key={appointment.id}
            className={`appointment ${appointment.tone}`}
            style={appointmentPosition(appointment)}
            onClick={() => onSelect(appointment)}
          >
            <time>
              {appointment.time}—{appointment.end}
            </time>
            <div className="appointment-client">
              <strong>{appointment.name}</strong>
              <i className={`status-badge ${statusClass(appointment.status)}`}>
                {appointment.status}
              </i>
            </div>
            <span className="appointment-services">{appointment.services}</span>
            <i className={`source-badge ${sourceClass(appointment.source)}`}>
              {sourceLabel(appointment.source)}
            </i>
          </button>
        ))}
      </div>
    </div>
  );
}

function WeekCalendar({
  dates,
  currentTime,
  workingHours,
  closures,
  appointmentsForWeek,
  onSelect,
}) {
  const today = israelToday();
  return (
    <div className="week-calendar">
      <div className="week-spacer"></div>
      {dates.map((item) => (
        <div
          className={`week-heading ${item === today ? "is-today" : ""}`}
          key={item}
        >
          <span>{formatWeekDay(item)}</span>
          <strong>{item.slice(8, 10)}</strong>
        </div>
      ))}
      <div className="hours exact-hours">
        {hours.map((hour, index) => (
          <span key={hour} style={{ top: `${index * 10}%` }}>
            {hour}
          </span>
        ))}
      </div>
      {dates.map((item) => (
        <div className="week-column" key={item}>
          <BlockedTimeLayer
            date={item}
            workingHours={workingHours}
            closures={closures}
            compact
          />
          {item === today && (
            <CurrentTimeIndicator time={currentTime} compact />
          )}
          {appointmentsForWeek
            .filter((appointment) => appointment.date === item)
            .map((appointment) => (
              <button
                key={appointment.id}
                className={`week-appointment ${appointment.tone}`}
                style={appointmentPosition(appointment)}
                onClick={() => onSelect(appointment)}
              >
                <time>
                  {appointment.time}—{appointment.end}
                </time>
                <div className="appointment-client">
                  <strong>{appointment.name}</strong>
                  <i
                    className={`status-badge ${statusClass(appointment.status)}`}
                  >
                    {appointment.status}
                  </i>
                </div>
                <span className="appointment-services">
                  {appointment.services}
                </span>
                <i
                  className={`source-badge ${sourceClass(appointment.source)}`}
                >
                  {sourceLabel(appointment.source)}
                </i>
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}

function Clients({ appointments }) {
  const [query, setQuery] = useState("");
  const clients = Object.values(
    appointments.reduce((all, appointment) => {
      const phone = normalizePhone(appointment.phone);
      const current = all[phone] || {
        name: appointment.name,
        phone,
        notes: appointment.notes,
        count: 0,
        last: appointment.date,
      };
      current.count += 1;
      if (appointment.date > current.last) current.last = appointment.date;
      all[phone] = current;
      return all;
    }, {}),
  ).filter((client) =>
    `${client.name} ${client.phone} ${formatPhone(client.phone)}`.includes(
      query,
    ),
  );
  return (
    <section className="management-card">
      <div className="management-toolbar">
        <strong>{clients.length} לקוחות</strong>
        <input
          placeholder="חיפוש לפי שם או טלפון"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {clients.length ? (
        <div className="data-table">
          <div className="table-row table-head">
            <span>לקוחה</span>
            <span>טלפון</span>
            <span>מספר תורים</span>
            <span>תור אחרון</span>
          </div>
          {clients.map((client) => (
            <div className="table-row" key={client.phone}>
              <span>
                <strong>{client.name}</strong>
                <small>{client.notes}</small>
              </span>
              <a href={`tel:${client.phone}`}>{formatPhone(client.phone)}</a>
              <span>{client.count}</span>
              <span>{formatIsraelDate(client.last)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-management empty-clients">
          <strong>
            {query
              ? "לא נמצאו לקוחות מתאימות לחיפוש"
              : "עדיין אין לקוחות במערכת"}
          </strong>
          <span>
            {query
              ? "אפשר לנסות שם או מספר טלפון אחר"
              : "לקוחות יופיעו כאן לאחר קביעת התור הראשון"}
          </span>
        </div>
      )}
    </section>
  );
}

function Services({ services, setServices }) {
  return (
    <section className="management-card">
      <div className="management-toolbar">
        <div>
          <strong>{services.length} טיפולים פעילים</strong>
          <small>לכל טיפול מתווספות אוטומטית 5 דקות ביומן</small>
        </div>
      </div>
      <div className="service-management-grid">
        {services.map((service) => (
          <article key={service.id}>
            <span>✦</span>
            <div>
              <strong>{service.name}</strong>
              <small>משך הטיפול</small>
            </div>
            <label>
              <input
                type="number"
                min="5"
                step="5"
                value={service.minutes}
                onChange={(event) =>
                  setServices((current) =>
                    current.map((item) =>
                      item.id === service.id
                        ? { ...item, minutes: Number(event.target.value) }
                        : item,
                    ),
                  )
                }
              />{" "}
              דקות
            </label>
          </article>
        ))}
      </div>
      <div className="save-note">
        השינויים נשמרים בטבלת הטיפולים ומשפיעים מיד על חישוב המשבצות.
      </div>
    </section>
  );
}

function Employees({ employees, setEmployees }) {
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [passwordEdit, setPasswordEdit] = useState({ id: null, value: "" });
  const [message, setMessage] = useState("");
  async function addEmployee(event) {
    event.preventDefault();
    const response = await legacyFetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error);
      return;
    }
    setEmployees((current) => [...current, data.employee]);
    setForm({ name: "", username: "", password: "" });
    setMessage("העובדת נוספה בהצלחה");
  }
  async function updateEmployeePassword() {
    if (!passwordEdit.value) return;
    const response = await legacyFetch("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: passwordEdit.id,
        password: passwordEdit.value,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error);
      return;
    }
    setPasswordEdit({ id: null, value: "" });
    setMessage("הסיסמה עודכנה בהצלחה");
  }
  async function deleteEmployee(id) {
    const response = await legacyFetch("/api/employees", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error);
      return;
    }
    setEmployees((current) => current.filter((item) => item.id !== id));
    setMessage("העובדת נמחקה");
  }
  return (
    <div className="management-columns">
      <section className="management-card">
        <h3>צוות המכון</h3>
        {employees.map((employee) => (
          <article className="employee-row employee-edit-row" key={employee.id}>
            <div>{employee.name.slice(0, 1)}</div>
            <span>
              <strong>{employee.name}</strong>
              <small>
                @{employee.username} · {employee.role}
              </small>
              {passwordEdit.id === employee.id && (
                <span className="inline-password">
                  <input
                    type="password"
                    minLength="6"
                    placeholder="סיסמה חדשה"
                    value={passwordEdit.value}
                    onChange={(event) =>
                      setPasswordEdit({
                        ...passwordEdit,
                        value: event.target.value,
                      })
                    }
                  />
                  <button onClick={updateEmployeePassword}>שמירה</button>
                </span>
              )}
            </span>
            {employee.role !== "מנהלת" && (
              <div className="employee-actions">
                <button
                  onClick={() =>
                    setPasswordEdit({ id: employee.id, value: "" })
                  }
                >
                  שינוי סיסמה
                </button>
                <button onClick={() => deleteEmployee(employee.id)}>
                  מחיקה
                </button>
              </div>
            )}
          </article>
        ))}
        {message && (
          <div
            className={
              message.includes("בהצלחה") || message === "העובדת נמחקה"
                ? "password-success"
                : "login-error"
            }
          >
            {message}
          </div>
        )}
      </section>
      <form className="management-card compact-form" onSubmit={addEmployee}>
        <span className="eyebrow">למנהלת בלבד</span>
        <h3>הוספת עובדת</h3>
        <label>שם מלא</label>
        <input
          required
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <label>שם משתמש</label>
        <input
          required
          value={form.username}
          onChange={(event) =>
            setForm({ ...form, username: event.target.value })
          }
        />
        <label>סיסמה ראשונית</label>
        <input
          required
          minLength="6"
          type="password"
          value={form.password}
          onChange={(event) =>
            setForm({ ...form, password: event.target.value })
          }
        />
        <button className="primary-btn">הוספת עובדת</button>
      </form>
    </div>
  );
}

function ChangePassword({ currentUser }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [message, setMessage] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (form.next.length < 6) {
      setMessage("הסיסמה החדשה חייבת להכיל לפחות 6 תווים");
      return;
    }
    if (form.next !== form.confirm) {
      setMessage("אימות הסיסמה אינו תואם");
      return;
    }
    const response = await legacyFetch("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: currentUser.id,
        currentPassword: form.current,
        password: form.next,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error);
      return;
    }
    setForm({ current: "", next: "", confirm: "" });
    setMessage("הסיסמה שונתה בהצלחה");
  }
  return (
    <form
      className="management-card compact-form password-card"
      onSubmit={submit}
    >
      <span className="eyebrow">אבטחת חשבון</span>
      <h3>שינוי סיסמה אישית</h3>
      <label>סיסמה נוכחית</label>
      <input
        required
        type="password"
        value={form.current}
        onChange={(event) => setForm({ ...form, current: event.target.value })}
      />
      <label>סיסמה חדשה</label>
      <input
        required
        type="password"
        value={form.next}
        onChange={(event) => setForm({ ...form, next: event.target.value })}
      />
      <label>אימות סיסמה חדשה</label>
      <input
        required
        type="password"
        value={form.confirm}
        onChange={(event) => setForm({ ...form, confirm: event.target.value })}
      />
      {message && (
        <div
          className={
            message.includes("בהצלחה") ? "password-success" : "login-error"
          }
        >
          {message}
        </div>
      )}
      <button className="primary-btn">שמירת סיסמה חדשה</button>
    </form>
  );
}

function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    async function loadLogs() {
      try {
        const response = await legacyFetch("/api/audit-logs", {
          cache: "no-store",
        });
        const data = await response.json();
        if (active && response.ok) setLogs(data.logs || []);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadLogs();
    const timer = setInterval(loadLogs, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const normalized = query.trim().toLowerCase();
  const visibleLogs = logs.filter(
    (log) =>
      !normalized ||
      [log.employeeName, log.action, log.description].some((value) =>
        value?.toLowerCase().includes(normalized),
      ),
  );
  const formatTime = (value) =>
    new Intl.DateTimeFormat("he-IL", {
      timeZone: "Asia/Jerusalem",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));

  return (
    <section className="management-card">
      <div className="management-toolbar">
        <div>
          <strong>{logs.length} פעולות אחרונות</strong>
          <small>היומן מתעד שינויים שביצעו הצוות והאתר</small>
        </div>
        <input
          placeholder="חיפוש לפי פעולה, עובדת או פרטים"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {loading ? (
        <p className="empty-management">טוען את יומן הפעילות…</p>
      ) : visibleLogs.length ? (
        <div className="audit-list">
          {visibleLogs.map((log) => (
            <article className="audit-row" key={log.id}>
              <div className="audit-mark">≡</div>
              <div>
                <strong>{log.action}</strong>
                <p>{log.description}</p>
                <span className="audit-meta">
                  {log.employeeName} · {formatTime(log.createdAt)}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-management">
          <strong>
            {query ? "לא נמצאו פעולות מתאימות" : "עדיין אין פעולות ביומן"}
          </strong>
        </div>
      )}
    </section>
  );
}

function WorkingHours({ hours, setHours }) {
  return (
    <section className="management-card">
      <div className="management-toolbar">
        <div>
          <strong>שעות העבודה הקבועות</strong>
          <small>מוצג למנהלת בלבד</small>
        </div>
        <span className="saved-badge">✓ נשמר אוטומטית</span>
      </div>
      <div className="hours-list">
        {hours.map((item, index) => (
          <div className="hours-row" key={item.day}>
            <label className="day-toggle">
              <input
                type="checkbox"
                checked={item.active}
                onChange={(event) =>
                  setHours((current) =>
                    current.map((day, dayIndex) =>
                      dayIndex === index
                        ? { ...day, active: event.target.checked }
                        : day,
                    ),
                  )
                }
              />
              <strong>יום {item.day}</strong>
            </label>
            {item.active ? (
              <div>
                <input
                  type="time"
                  value={item.start}
                  onChange={(event) =>
                    setHours((current) =>
                      current.map((day, dayIndex) =>
                        dayIndex === index
                          ? { ...day, start: event.target.value }
                          : day,
                      ),
                    )
                  }
                />
                <span>עד</span>
                <input
                  type="time"
                  value={item.end}
                  onChange={(event) =>
                    setHours((current) =>
                      current.map((day, dayIndex) =>
                        dayIndex === index
                          ? { ...day, end: event.target.value }
                          : day,
                      ),
                    )
                  }
                />
              </div>
            ) : (
              <span className="closed-label">המכון סגור</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Closures({ closures, setClosures, today }) {
  const [form, setForm] = useState({
    date: addDays(today, 1),
    from: "09:00",
    to: "18:00",
    reason: "",
  });
  function addClosure(event) {
    event.preventDefault();
    setClosures((current) => [...current, { ...form, id: Date.now() }]);
    setForm({
      date: addDays(today, 1),
      from: "09:00",
      to: "18:00",
      reason: "",
    });
  }
  return (
    <div className="management-columns">
      <section className="management-card">
        <h3>חסימות קיימות</h3>
        {closures.length ? (
          closures.map((closure) => (
            <article className="closure-row" key={closure.id}>
              <div>
                <strong>{formatIsraelDate(closure.date)}</strong>
                <small>
                  {closure.from}—{closure.to} · {closure.reason || "ללא פירוט"}
                </small>
              </div>
              <button
                onClick={() =>
                  setClosures((current) =>
                    current.filter((item) => item.id !== closure.id),
                  )
                }
              >
                הסרה
              </button>
            </article>
          ))
        ) : (
          <p className="empty-management">אין חופשות או חסימות עתידיות.</p>
        )}
      </section>
      <form className="management-card compact-form" onSubmit={addClosure}>
        <span className="eyebrow">למנהלת בלבד</span>
        <h3>חסימת זמן</h3>
        <label>תאריך</label>
        <input
          required
          type="date"
          min={today}
          value={form.date}
          onChange={(event) => setForm({ ...form, date: event.target.value })}
        />
        <div className="new-booking-grid">
          <div>
            <label>משעה</label>
            <input
              type="time"
              value={form.from}
              onChange={(event) =>
                setForm({ ...form, from: event.target.value })
              }
            />
          </div>
          <div>
            <label>עד שעה</label>
            <input
              type="time"
              value={form.to}
              onChange={(event) => setForm({ ...form, to: event.target.value })}
            />
          </div>
        </div>
        <label>סיבה</label>
        <input
          value={form.reason}
          placeholder="למשל: חופשה"
          onChange={(event) => setForm({ ...form, reason: event.target.value })}
        />
        <button className="primary-btn">הוספת חסימה</button>
      </form>
    </div>
  );
}

function donutGradient(items) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!total) return "conic-gradient(#eee7e4 0 100%)";
  let cursor = 0;
  return `conic-gradient(${items
    .map((item) => {
      const start = cursor;
      cursor += (item.value / total) * 100;
      return `${item.color} ${start}% ${cursor}%`;
    })
    .join(",")})`;
}

function Dashboard({ appointments, services }) {
  const today = israelToday();
  const currentMonth = today.slice(0, 7);
  const monthAppointments = appointments.filter((appointment) =>
    appointment.date.startsWith(currentMonth),
  );
  const completed = monthAppointments.filter(
    (appointment) => appointment.status === "הסתיים",
  ).length;
  const upcoming = appointments.filter(
    (appointment) =>
      appointment.status === "נקבע" &&
      `${appointment.date} ${appointment.time}` >=
        `${today} ${israelTimeHHMM()}`,
  ).length;
  const cancelled = monthAppointments.filter(
    (appointment) => appointment.status === "בוטל",
  ).length;
  const countedTreatmentStatuses = ["נקבע", "הסתיים"];
  const treatmentCounts = services.map((service) => ({
    name: service.name,
    value: monthAppointments.filter(
      (appointment) =>
        countedTreatmentStatuses.includes(appointment.status) &&
        (appointment.serviceIds || []).includes(service.id),
    ).length,
  }));
  const maxTreatments = Math.max(
    ...treatmentCounts.map((item) => item.value),
    1,
  );
  const statusItems = [
    {
      label: "נקבעו",
      value: monthAppointments.filter(
        (appointment) => appointment.status === "נקבע",
      ).length,
      color: "#6f8fbd",
      className: "blue",
    },
    { label: "הסתיימו", value: completed, color: "#8eaa87", className: "sage" },
    {
      label: "לא הופיעה",
      value: monthAppointments.filter(
        (appointment) => appointment.status === "לא הופיעה",
      ).length,
      color: "#d3a259",
      className: "sand",
    },
    { label: "בוטלו", value: cancelled, color: "#bd7378", className: "rose" },
  ];
  const statusTotal = statusItems.reduce((sum, item) => sum + item.value, 0);
  const websiteAppointments = monthAppointments.filter(
    (appointment) => appointment.source === "customer",
  ).length;
  const manualAppointments = monthAppointments.filter(
    (appointment) => appointment.source !== "customer",
  ).length;
  const sourceItems = [
    { value: websiteAppointments, color: "#9a73ad" },
    { value: manualAppointments, color: "#c99a72" },
  ];
  const monthLabel = formatIsraelDate(`${currentMonth}-01`, { day: undefined });
  return (
    <>
      <section className="stats-strip dashboard-stats">
        <article>
          <span>טיפולים שהסתיימו החודש</span>
          <strong>{completed}</strong>
          <small>לפי סטטוס התורים בפועל</small>
        </article>
        <article>
          <span>תורים עתידיים</span>
          <strong>{upcoming}</strong>
          <small>נקבעו וטרם הגיע זמנם</small>
        </article>
        <article>
          <span>ביטולים החודש</span>
          <strong>{cancelled}</strong>
          <small>
            {monthAppointments.length
              ? `${Math.round((cancelled / monthAppointments.length) * 100)}% מתורי החודש`
              : "אין עדיין תורים החודש"}
          </small>
        </article>
      </section>
      <section className="dashboard-grid">
        <article className="chart-card treatments-chart">
          <div>
            <h3>טיפולים לפי סוג</h3>
            <small>נקבעו והסתיימו · {monthLabel}</small>
          </div>
          <div className="column-chart">
            {treatmentCounts.map((item) => (
              <div className="column-item" key={item.name}>
                <strong>{item.value}</strong>
                <i>
                  <b
                    style={{
                      height: `${item.value ? Math.max((item.value / maxTreatments) * 100, 8) : 0}%`,
                    }}
                  ></b>
                </i>
                <span>{item.name}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="chart-card">
          <div>
            <h3>סטטוס תורים</h3>
            <small>{monthLabel}</small>
          </div>
          <div
            className="donut"
            style={{ background: donutGradient(statusItems) }}
          >
            <div>
              <strong>{statusTotal}</strong>
              <span>תורים</span>
            </div>
          </div>
          <ul className="legend">
            {statusItems.map((item) => (
              <li key={item.label}>
                <i className={`dot ${item.className}`}></i>
                {item.label} <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
        </article>
        <article className="chart-card">
          <div>
            <h3>מקור התורים</h3>
            <small>{monthLabel}</small>
          </div>
          <div
            className="donut"
            style={{ background: donutGradient(sourceItems) }}
          >
            <div>
              <strong>{websiteAppointments + manualAppointments}</strong>
              <span>תורים</span>
            </div>
          </div>
          <ul className="legend">
            <li>
              <i className="dot lavender"></i>אתר{" "}
              <strong>{websiteAppointments}</strong>
            </li>
            <li>
              <i className="dot copper"></i>ידני{" "}
              <strong>{manualAppointments}</strong>
            </li>
          </ul>
        </article>
      </section>
    </>
  );
}
