const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const statusToEnglish = {
  נקבע: "scheduled",
  scheduled: "scheduled",
  הסתיים: "completed",
  completed: "completed",
  "לא הופיעה": "no_show",
  "לא הגיעה": "no_show",
  no_show: "no_show",
  "no-show": "no_show",
  בוטל: "cancelled",
  cancelled: "cancelled",
  canceled: "cancelled",
};
const statusToHebrew = {
  scheduled: "נקבע",
  נקבע: "נקבע",
  completed: "הסתיים",
  הסתיים: "הסתיים",
  no_show: "לא הופיעה",
  "no-show": "לא הופיעה",
  "לא הופיעה": "לא הופיעה",
  "לא הגיעה": "לא הופיעה",
  cancelled: "בוטל",
  canceled: "בוטל",
  בוטל: "בוטל",
};
const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function statusForUi(value) {
  const normalized = String(value || "scheduled")
    .trim()
    .toLowerCase();
  return (
    statusToHebrew[normalized] ||
    statusToHebrew[String(value || "").trim()] ||
    "נקבע"
  );
}

function answer(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function request(path, options = {}) {
  return fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
}

async function jsonRequest(path, options = {}) {
  const response = await request(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { response, data };
  return { response, data };
}

async function serviceCatalog() {
  const { response, data } = await jsonRequest("/services");
  if (!response.ok) return [];
  return data.map((service) => ({
    id: service.code,
    mongoId: service._id,
    name: service.name,
    category: ["haircut", "styling"].includes(service.code)
      ? "שיער"
      : ["manicure", "pedicure"].includes(service.code)
        ? "ציפורניים"
        : service.code === "bride"
          ? "אירועים"
          : "טיפוח",
    minutes: service.durationMinutes,
    icon:
      {
        haircut: "✂",
        styling: "◇",
        manicure: "◌",
        pedicure: "◡",
        peeling: "✦",
        wax: "⌁",
        facial: "☼",
        bride: "♢",
      }[service.code] || "✦",
  }));
}

async function codesToMongoIds(codes = []) {
  const services = await serviceCatalog();
  return codes.map(
    (code) => services.find((service) => service.id === code)?.mongoId || code,
  );
}

function appointmentForOldUi(item) {
  const services = Array.isArray(item.serviceIds) ? item.serviceIds : [];
  const codes = services.map((service) =>
    typeof service === "object" ? service.code : service,
  );
  const names = services
    .map((service) => (typeof service === "object" ? service.name : service))
    .filter(Boolean);
  return {
    id: item._id || item.id,
    date: item.date,
    time: item.startTime || item.time,
    end: item.endTime || item.end,
    name: item.customerName || item.name,
    phone: item.phone || "",
    notes: item.notes || "",
    services: names.length ? names.join(" · ") : item.services || "",
    serviceIds: codes,
    status: statusForUi(item.status),
    tone: `treatment-${codes[0] || "default"}`,
    source:
      item.source === "website"
        ? "customer"
        : item.source === "manual"
          ? "staff"
          : item.source,
    createdAt: item.createdAt,
  };
}

async function saveAppointment(body, editing = false) {
  const serviceIds = await codesToMongoIds(body.serviceIds);
  const payload = {
    customerName: body.name,
    phone: body.phone,
    notes: body.notes || "",
    serviceIds,
    date: body.date,
    startTime: body.time,
    status: statusToEnglish[body.status] || "scheduled",
    // מקור התור נשלח רק ביצירה. השרת מאמת אם זו לקוחה או משתמשת מחוברת.
    ...(!editing
      ? { bookingOrigin: body.source === "customer" ? "customer" : "staff" }
      : {}),
  };
  const path = editing ? `/appointments/${body.id}` : "/appointments";
  const { response, data } = await jsonRequest(path, {
    method: editing ? "PATCH" : "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok)
    return answer(
      { error: data.message || "שמירת התור נכשלה" },
      response.status,
    );
  return answer(
    { appointment: appointmentForOldUi(data) },
    editing ? 200 : 201,
  );
}

// שכבת התאמה בין ממשק Sites המקורי לבין API המקומי של Express ו-MongoDB.
export async function legacyFetch(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};

  if (path === "/api/auth/session" && method === "GET") {
    const { response, data } = await jsonRequest("/auth/me");
    const user = data.user;
    return user
      ? answer({
          employee: {
            id: user.id,
            name: user.name,
            username: user.username,
            role: user.role === "manager" ? "מנהלת" : "עובדת",
          },
        })
      : answer({ employee: null }, 401);
  }
  if (path === "/api/auth/session" && method === "DELETE") {
    const { response, data } = await jsonRequest("/auth/logout", {
      method: "POST",
    });
    return answer(data, response.status);
  }
  if (path === "/api/auth/login" && method === "POST") {
    const { response, data } = await jsonRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!response.ok) return answer({ error: data.message }, response.status);
    const user = data.user;
    return answer({
      employee: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role === "manager" ? "מנהלת" : "עובדת",
      },
    });
  }

  if (path === "/api/settings" && method === "GET") {
    const [{ response, data }, services] = await Promise.all([
      jsonRequest("/settings"),
      serviceCatalog(),
    ]);
    if (!response.ok) return answer({ error: data.message }, response.status);
    return answer({
      settings: {
        services,
        workingHours: (data.workingHours || [])
          .sort((a, b) => a.day - b.day)
          .map((hours) => ({
            day: dayNames[hours.day],
            active: hours.active,
            start: hours.start,
            end: hours.end,
          })),
        closures: (data.closures || []).map((closure) => ({
          id: closure._id || `${closure.date}-${closure.start}`,
          date: closure.date,
          from: closure.start,
          to: closure.end,
          reason: closure.reason,
        })),
      },
    });
  }
  if (path === "/api/settings" && method === "PUT") {
    if (body.key === "services") {
      const current = await serviceCatalog();
      for (const service of body.value) {
        const target = current.find((item) => item.id === service.id);
        if (target && Number(target.minutes) !== Number(service.minutes))
          await request(`/services/${target.mongoId}`, {
            method: "PATCH",
            body: JSON.stringify({ durationMinutes: Number(service.minutes) }),
          });
      }
      return answer({ key: body.key, value: body.value });
    }
    const value =
      body.key === "workingHours"
        ? body.value.map((hours, day) => ({
            day,
            active: hours.active,
            start: hours.start,
            end: hours.end,
          }))
        : body.value.map((closure) => ({
            date: closure.date,
            start: closure.from,
            end: closure.to,
            reason: closure.reason,
          }));
    const { response, data } = await jsonRequest("/settings", {
      method: "PATCH",
      body: JSON.stringify({ [body.key]: value }),
    });
    return response.ok
      ? answer({ key: body.key, value: body.value })
      : answer({ error: data.message }, response.status);
  }

  if (path === "/api/appointments" && method === "GET") {
    let result = await jsonRequest("/appointments");
    if (result.response.status === 401)
      result = await jsonRequest("/appointments/public-calendar");
    if (!result.response.ok)
      return answer({ error: result.data.message }, result.response.status);
    return answer({ appointments: result.data.map(appointmentForOldUi) });
  }
  if (path === "/api/appointments" && method === "POST")
    return saveAppointment(body, false);
  if (path === "/api/appointments" && method === "PATCH")
    return saveAppointment(body, true);
  if (path === "/api/appointments" && method === "DELETE") {
    const { response, data } = await jsonRequest(`/appointments/${body.id}`, {
      method: "DELETE",
    });
    return response.ok
      ? answer({ deleted: body.id })
      : answer({ error: data.message }, response.status);
  }

  if (path === "/api/employees" && method === "GET") {
    const { response, data } = await jsonRequest("/users");
    return response.ok
      ? answer({
          employees: data.map((user) => ({
            id: user._id,
            name: user.name,
            username: user.username,
            role: user.role === "manager" ? "מנהלת" : "עובדת",
          })),
        })
      : answer({ error: data.message }, response.status);
  }
  if (path === "/api/employees" && method === "POST") {
    const { response, data } = await jsonRequest("/users", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return response.ok
      ? answer(
          {
            employee: {
              id: data.id,
              name: data.name,
              username: data.username,
              role: "עובדת",
            },
          },
          201,
        )
      : answer({ error: data.message }, response.status);
  }
  if (path === "/api/employees" && method === "PATCH") {
    const ownPassword = Boolean(body.currentPassword);
    const target = ownPassword
      ? "/auth/password"
      : `/users/${body.id}/password`;
    const payload = ownPassword
      ? { currentPassword: body.currentPassword, newPassword: body.password }
      : { password: body.password };
    const { response, data } = await jsonRequest(target, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return response.ok
      ? answer({ ok: true })
      : answer({ error: data.message }, response.status);
  }
  if (path === "/api/employees" && method === "DELETE") {
    const { response, data } = await jsonRequest(`/users/${body.id}`, {
      method: "DELETE",
    });
    return response.ok
      ? answer({ deleted: body.id })
      : answer({ error: data.message }, response.status);
  }

  if (path === "/api/audit-logs" && method === "GET") {
    const { response, data } = await jsonRequest("/audit");
    return response.ok
      ? answer({
          logs: data.map((log) => ({
            id: log._id,
            employeeName: log.userName,
            action: log.action,
            description: log.details,
            createdAt: log.createdAt,
          })),
        })
      : answer({ error: data.message }, response.status);
  }
  return request(path.replace(/^\/api/, ""), options);
}
