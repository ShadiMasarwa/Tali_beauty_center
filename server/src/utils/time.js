export const BUFFER_MINUTES = 5;
export function toMinutes(value) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
export function toTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}
export function totalReservedMinutes(services) {
  return services.reduce(
    (sum, service) => sum + service.durationMinutes + BUFFER_MINUTES,
    0,
  );
}
