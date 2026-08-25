import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import session from "express-session";
import MongoStore from "connect-mongo";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.routes.js";
import appointmentRoutes from "./routes/appointments.routes.js";
import serviceRoutes from "./routes/services.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import userRoutes from "./routes/users.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import exportRoutes from "./routes/export.routes.js";
import { errorHandler } from "./middleware/error.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());
  app.use(session({
    name: "talie.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI, collectionName: "sessions", ttl: 12 * 60 * 60 }),
    cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 12 * 60 * 60 * 1000 },
  }));
  app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", authRoutes);
  app.use("/api/appointments", appointmentRoutes);
  app.use("/api/services", serviceRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/export", exportRoutes);
  app.use(errorHandler);
  return app;
}
