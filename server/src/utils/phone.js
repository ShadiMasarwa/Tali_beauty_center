export function normalizePhone(value = "") { return String(value).replace(/\D/g, ""); }
export function isValidPhone(value) {
  const phone = normalizePhone(value);
  return phone.startsWith("05") ? phone.length === 10 : phone.length === 9;
}
export function formatPhone(value) {
  const phone = normalizePhone(value);
  if (phone.startsWith("05") && phone.length === 10) return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
  if (phone.length === 9) return `${phone.slice(0, 2)}-${phone.slice(2, 5)}-${phone.slice(5)}`;
  return phone;
}
