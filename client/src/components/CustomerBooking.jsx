"use client";

import { useEffect, useMemo, useState } from "react";
import { legacyFetch } from "../legacyFetch.js";

const defaultServices = [
  { id: "haircut", name: "תספורת", category: "שיער", minutes: 45, icon: "✂" },
  {
    id: "styling",
    name: "עיצוב שיער",
    category: "שיער",
    minutes: 60,
    icon: "◇",
  },
  {
    id: "manicure",
    name: "מניקור",
    category: "ציפורניים",
    minutes: 50,
    icon: "◌",
  },
  {
    id: "pedicure",
    name: "פדיקור",
    category: "ציפורניים",
    minutes: 60,
    icon: "◡",
  },
  { id: "peeling", name: "פילינג", category: "טיפוח", minutes: 40, icon: "✦" },
  { id: "wax", name: "הסרת שיער", category: "טיפוח", minutes: 35, icon: "⌁" },
  {
    id: "facial",
    name: "טיפול פנים",
    category: "טיפוח",
    minutes: 75,
    icon: "☼",
  },
  {
    id: "bride",
    name: "חבילת כלה",
    category: "אירועים",
    minutes: 240,
    icon: "♢",
  },
];

const defaultWorkingHours = [
  { day: "ראשון", active: true, start: "09:00", end: "18:00" },
  { day: "שני", active: true, start: "09:00", end: "18:00" },
  { day: "שלישי", active: true, start: "09:00", end: "18:00" },
  { day: "רביעי", active: true, start: "09:00", end: "18:00" },
  { day: "חמישי", active: true, start: "09:00", end: "18:00" },
  { day: "שישי", active: true, start: "09:00", end: "14:00" },
  { day: "שבת", active: false, start: "09:00", end: "18:00" },
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

function sanitizePhoneInput(value) {
  return value.replace(/[^\d-]/g, "").slice(0, 13);
}

function normalizePhone(value) {
  return value.replace(/\D/g, "");
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

const ISRAEL_TIME_ZONE = "Asia/Jerusalem";
const dayLetters = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function israelToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISRAEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function israelTimeHHMM() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISRAEL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.hour}:${value.minute}`;
}

function addDays(dateKey, amount) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount, 12))
    .toISOString()
    .slice(0, 10);
}

function timeToMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}
function minutesToTime(total) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function createBookingDays() {
  const today = israelToday();
  const result = [];
  let offset = 0;
  while (result.length < 5) {
    const key = addDays(today, offset);
    const [year, month, day] = key.split("-").map(Number);
    const weekDay = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
    if (weekDay !== 6)
      result.push({
        key,
        day: dayLetters[weekDay],
        date: `${day}.${month}`,
        offset,
        weekDay,
      });
    offset += 1;
  }
  return result;
}

export default function CustomerBooking() {
  const bookingDays = useMemo(() => createBookingDays(), []);
  const [selected, setSelected] = useState([]);
  const [day, setDay] = useState(bookingDays[0]);
  const [time, setTime] = useState("");
  const [step, setStep] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", notes: "" });
  const [remoteAppointments, setRemoteAppointments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [services, setServices] = useState(defaultServices);
  const [workingHours, setWorkingHours] = useState(defaultWorkingHours);
  const [closures, setClosures] = useState([]);

  useEffect(() => {
    let active = true;
    async function loadAppointments() {
      try {
        const response = await legacyFetch("/api/appointments", {
          cache: "no-store",
        });
        const data = await response.json();
        if (active && response.ok)
          setRemoteAppointments(data.appointments || []);
      } catch {
        /* ההצעות עדיין משתמשות בנתוני היומן המקומיים אם אין חיבור */
      }
    }
    loadAppointments();
    const timer = setInterval(loadAppointments, 3000);
    return () => {
      active = false;
      clearInterval(timer);
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
        setServices(data.settings.services || defaultServices);
        setWorkingHours(data.settings.workingHours || defaultWorkingHours);
        setClosures(data.settings.closures || []);
      } catch {
        /* ממשיכים עם ברירת המחדל אם ההגדרות אינן זמינות */
      }
    }
    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  const treatmentMinutes = useMemo(
    () =>
      services
        .filter((s) => selected.includes(s.id))
        .reduce((sum, s) => sum + s.minutes, 0),
    [selected, services],
  );
  const reservedMinutes = treatmentMinutes + selected.length * 5;
  const chosenNames = services
    .filter((s) => selected.includes(s.id))
    .map((s) => s.name);
  const selectedDayHours = workingHours[day.weekDay];
  const workStart = selectedDayHours?.active
    ? timeToMinutes(selectedDayHours.start)
    : 0;
  const workEnd = selectedDayHours?.active
    ? timeToMinutes(selectedDayHours.end)
    : 0;
  const dayClosures = closures.filter((closure) => closure.date === day.key);
  const remoteIntervals = remoteAppointments
    .filter(
      (appointment) =>
        appointment.date === day.key && appointment.status !== "בוטל",
    )
    .map((appointment) => [appointment.time, appointment.end]);
  const bookedIntervals = remoteIntervals;
  const currentMinutes = timeToMinutes(israelTimeHHMM());
  const availableSlots =
    reservedMinutes && selectedDayHours?.active
      ? Array.from(
          { length: Math.max(0, Math.floor((workEnd - workStart) / 15) + 1) },
          (_, index) => workStart + index * 15,
        )
          .filter((start) => start + reservedMinutes <= workEnd)
          .filter((start) => day.offset !== 0 || start >= currentMinutes)
          .filter(
            (start) =>
              !bookedIntervals.some(
                ([from, to]) =>
                  start < timeToMinutes(to) &&
                  start + reservedMinutes > timeToMinutes(from),
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

  function toggleService(id) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
    setTime("");
  }

  function continueToTimes() {
    if (selected.length) setStep(2);
  }

  async function submitBooking(event) {
    event.preventDefault();
    if (!form.name.trim() || !isValidPhone(form.phone) || !time) return;
    setSaving(true);
    setBookingError("");
    const appointment = {
      date: day.key,
      time,
      end: minutesToTime(timeToMinutes(time) + reservedMinutes),
      name: form.name.trim(),
      phone: normalizePhone(form.phone),
      notes: form.notes.trim(),
      services: chosenNames.join(" · "),
      serviceIds: selected,
      status: "נקבע",
      tone: treatmentTone(selected[0]),
      source: "customer",
    };
    try {
      const response = await legacyFetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appointment),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "שמירת התור נכשלה");
      setRemoteAppointments((current) => [...current, data.appointment]);
      setConfirmed(true);
    } catch (error) {
      setBookingError(error.message || "לא ניתן לשמור את התור כרגע");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="customer-page">
      <nav className="topbar container-xl">
        <a className="brand" href="/" aria-label="TALIÉ דף הבית">
          <span>É</span>TALI
          <small>BEAUTY STUDIO</small>
        </a>
        <div className="nav-note">המקום שלך לעצור, לנשום ולהתחדש</div>
        <a className="admin-link" href="/admin">
          כניסת צוות
        </a>
      </nav>

      <section className="booking-shell container-xl">
        <aside className="intro-panel">
          <div className="eyebrow">TALI’S BEAUTY STUDIO</div>
          <h1>
            הזמן שלך.
            <br />
            <em>היופי שלך.</em>
          </h1>
          <p>בחרי את הטיפולים שמתאימים לך, ואנחנו נמצא עבורך את הזמן המושלם.</p>
          <div className="studio-orbit" aria-hidden="true">
            <span>טלי</span>
            <i>beauty</i>
          </div>
          <div className="trust-row">
            <span>✦ בלי הרשמה</span>
            <span>✦ אישור מיידי</span>
          </div>
        </aside>

        <section className="booking-card">
          {!confirmed ? (
            <>
              <header className="booking-header">
                <div>
                  <span className="step-label">שלב {step} מתוך 3</span>
                  <h2>
                    {step === 1
                      ? "במה תרצי להתפנק?"
                      : step === 2
                        ? "מתי נוח לך?"
                        : "כמעט סיימנו"}
                  </h2>
                </div>
                <div className="progress-dots">
                  <b className={step >= 1 ? "active" : ""}></b>
                  <b className={step >= 2 ? "active" : ""}></b>
                  <b className={step >= 3 ? "active" : ""}></b>
                </div>
              </header>

              {step === 1 && (
                <>
                  <p className="helper">אפשר לבחור טיפול אחד או כמה טיפולים</p>
                  <div className="services-grid">
                    {services.map((service) => (
                      <button
                        key={service.id}
                        className={`service-card ${selected.includes(service.id) ? "selected" : ""}`}
                        onClick={() => toggleService(service.id)}
                      >
                        <span className="service-icon">{service.icon}</span>
                        <span>
                          <strong>{service.name}</strong>
                          <small>{service.minutes} דקות</small>
                        </span>
                        <i>{selected.includes(service.id) ? "✓" : "+"}</i>
                      </button>
                    ))}
                  </div>
                  <Summary
                    selected={selected}
                    treatmentMinutes={treatmentMinutes}
                    reservedMinutes={reservedMinutes}
                  />
                  <button
                    className="primary-btn"
                    disabled={!selected.length}
                    onClick={continueToTimes}
                  >
                    הצגת זמנים פנויים <span>←</span>
                  </button>
                </>
              )}

              {step === 2 && (
                <>
                  <p className="helper">
                    הזמנים מותאמים למשך הטיפולים שבחרת ולשעות פעילות המכון
                  </p>
                  <div className="days-row">
                    {bookingDays.map((item) => (
                      <button
                        key={item.key}
                        className={day.key === item.key ? "active" : ""}
                        onClick={() => {
                          setDay(item);
                          setTime("");
                        }}
                      >
                        <small>{item.day}</small>
                        <strong>{item.date}</strong>
                      </button>
                    ))}
                  </div>
                  {availableSlots.length ? (
                    <div className="times-grid customer-available-times">
                      {availableSlots.map((slot) => (
                        <button
                          key={slot}
                          className={time === slot ? "active" : ""}
                          onClick={() => setTime(slot)}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="no-customer-slots">
                      <strong>אין שעה פנויה ביום זה</strong>
                      <span>נסי לבחור יום אחר או להפחית טיפול מהבחירה.</span>
                    </div>
                  )}
                  <div className="selection-note">
                    <span>◷</span>
                    <div>
                      <small>משך משבצת ביומן</small>
                      <strong>{reservedMinutes} דקות</strong>
                      <small>כולל מרווחי ביטחון</small>
                    </div>
                  </div>
                  <div className="actions">
                    <button className="text-btn" onClick={() => setStep(1)}>
                      חזרה
                    </button>
                    <button
                      className="primary-btn"
                      disabled={!time}
                      onClick={() => setStep(3)}
                    >
                      המשך לפרטים <span>←</span>
                    </button>
                  </div>
                </>
              )}

              {step === 3 && (
                <form onSubmit={submitBooking}>
                  <div className="appointment-recap">
                    <div>
                      <small>המועד שבחרת</small>
                      <strong>
                        יום {day.day}, {day.date} בשעה {time}
                      </strong>
                    </div>
                    <button type="button" onClick={() => setStep(2)}>
                      שינוי
                    </button>
                  </div>
                  <label>שם מלא *</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="איך קוראים לך?"
                  />
                  <label>מספר טלפון *</label>
                  <input
                    required
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        phone: sanitizePhoneInput(e.target.value),
                      })
                    }
                    onBlur={() =>
                      setForm({ ...form, phone: formatPhone(form.phone) })
                    }
                    placeholder="05X-XXX-XXXX"
                  />
                  {form.phone && !isValidPhone(form.phone) && (
                    <div className="phone-error">
                      מספר נייד שמתחיל ב־05 חייב להכיל 10 ספרות; מספר אחר חייב
                      להכיל 9 ספרות.
                    </div>
                  )}
                  <label>
                    הערות <small>(אופציונלי)</small>
                  </label>
                  <textarea
                    rows="3"
                    value={form.notes}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                    placeholder="משהו שחשוב שנדע?"
                  />
                  <div className="chosen-list">
                    {chosenNames.join(" · ")}
                    <strong>{treatmentMinutes} דקות טיפול</strong>
                  </div>
                  {bookingError && (
                    <div className="login-error">{bookingError}</div>
                  )}
                  <div className="actions">
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => setStep(2)}
                    >
                      חזרה
                    </button>
                    <button className="primary-btn" disabled={saving}>
                      {saving ? "שומרת את התור..." : "קביעת הטיפול"}{" "}
                      <span>✓</span>
                    </button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <section className="success-state">
              <div className="success-mark">✓</div>
              <span className="eyebrow">מחכות לך</span>
              <h2>התור שלך נקבע!</h2>
              <p>
                {form.name}, שמרנו לך מקום ביום {day.day}, {day.date} בשעה{" "}
                {time}.
              </p>
              <div className="confirmation-card">
                <span>הטיפולים שלך</span>
                <strong>{chosenNames.join(", ")}</strong>
                <small>אישור נקלט במערכת המכון</small>
              </div>
              <button
                className="text-btn"
                onClick={() => {
                  setConfirmed(false);
                  setStep(1);
                  setSelected([]);
                  setTime("");
                }}
              >
                קביעת תור נוסף
              </button>
            </section>
          )}
        </section>
      </section>
    </main>
  );
}

function Summary({ selected, treatmentMinutes, reservedMinutes }) {
  if (!selected.length)
    return (
      <div className="summary empty">
        <span>בחרי טיפול כדי לראות את משך הזמן</span>
      </div>
    );
  return (
    <div className="summary">
      <div>
        <small>{selected.length} טיפולים נבחרו</small>
        <strong>{treatmentMinutes} דקות טיפול</strong>
      </div>
      <div>
        <small>זמן שמור ביומן</small>
        <strong>{reservedMinutes} דקות</strong>
      </div>
    </div>
  );
}
