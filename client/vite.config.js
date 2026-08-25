import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// הפלאגין מטפל בהמרת JSX לקוד React בזמן הפיתוח ובבנייה לייצור.
export default defineConfig({
  plugins: [react()],
});
