import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { authRouter } from "./routes/auth.js";
import { reportsRouter } from "./routes/reports.js";
import { adminRouter } from "./routes/admin.js";
import { createMeta } from "./services/meta.js";
import { createMailer } from "./services/mail.js";
import {
  authenticate,
  csrf,
  originGuard,
  rateLimit,
  HttpError,
} from "./security.js";
import { Notification } from "./models.js";
import { idParam } from "./validation.js";
export function createApp(
  config,
  {
    mailer = createMailer(config),
    meta = createMeta(config),
    logging = true,
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY_HOPS);
  if (logging)
    app.use(
      pinoHttp({
        genReqId: () => randomUUID(),
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
        redact: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers.set-cookie",
        ],
        autoLogging: { ignore: (req) => req.url === "/api/health" },
      }),
    );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          mediaSrc: ["'self'", "blob:", "data:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.NODE_ENV === "production" ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: "same-origin" },
    }),
  );
  app.use(
    cors({
      origin: config.APP_ORIGIN,
      credentials: true,
      allowedHeaders: ["Content-Type", "X-CSRF-Token"],
    }),
  );
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", (req, res) =>
    res
      .status(mongoose.connection.readyState === 1 ? 200 : 503)
      .json({
        status: mongoose.connection.readyState === 1 ? "ok" : "unavailable",
      }),
  );
  app.use(
    "/api",
    originGuard(config),
    express.json({ limit: "4mb" }),
    cookieParser(),
  );
  app.use("/api/auth", authRouter(config, mailer));
  app.use("/api", authenticate(config), csrf, rateLimit("api", 180, 60));
  app.get("/api/config", (req, res) =>
    res.json({ metaConfigured: !!config.MODEL_API_KEY }),
  );
  app.use("/api/reports", reportsRouter(meta));
  app.use("/api/admin", adminRouter(config));
  app.get("/api/notifications", async (req, res) => {
    const items = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    const unread = await Notification.countDocuments({
      user: req.user._id,
      readAt: null,
    });
    res.json({ items, unread });
  });
  app.post("/api/notifications/:id/read", idParam, async (req, res) => {
    const result = await Notification.updateOne(
      { _id: req.params.id, user: req.user._id },
      { $set: { readAt: new Date() } },
    );
    if (!result.matchedCount)
      throw new HttpError(404, "Notification not found.");
    res.json({ ok: true });
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  const web = resolve(fileURLToPath(new URL("../../dist", import.meta.url)));
  if (config.SERVE_WEB === "true" && existsSync(web)) {
    app.use(express.static(web, { index: false, maxAge: "1h" }));
    app.get("/{*path}", (req, res) =>
      res.set("Cache-Control", "no-cache").sendFile(resolve(web, "index.html")),
    );
  }
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof ZodError)
      return res
        .status(400)
        .json({ error: err.issues[0]?.message || "Invalid input." });
    if (err.type === "entity.too.large")
      return res
        .status(413)
        .json({ error: "Upload is too large. Choose smaller media." });
    if (err instanceof SyntaxError && err.status === 400)
      return res.status(400).json({ error: "Invalid JSON request." });
    if (err.code === 11000)
      return res
        .status(409)
        .json({ error: "This item already exists. Refresh before retrying." });
    if (err.status)
      return res
        .status(err.status)
        .json({ error: err.message, code: err.code });
    req.log?.error({ type: err.name, requestId: req.id }, "Request failed");
    res
      .status(500)
      .json({
        error: "Something went wrong. Please retry.",
        requestId: req.id,
      });
  });
  return app;
}
