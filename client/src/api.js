const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
export async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { credentials: "include", headers: { "Content-Type": "application/json", ...options.headers }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "הפעולה נכשלה");
  return data;
}
