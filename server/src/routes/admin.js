import { Router } from "express";
import { z } from "zod";
import { User, Session, Audit, Report } from "../models.js";
import {
  role,
  adminMfa,
  verified,
  publicUser,
  HttpError,
  audit,
} from "../security.js";
import { parse, pageQuery, escapeRegex, idParam } from "../validation.js";
export function adminRouter(config) {
  const router = Router();
  router.use(role("admin"), verified, adminMfa);
  router.get("/overview", async (req, res) => {
    const [users, officers, inactive, unassigned, reports] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "officer", active: true }),
      User.countDocuments({ active: false }),
      Report.countDocuments({ assignedTo: null, status: { $ne: "Closed" } }),
      Report.countDocuments(),
    ]);
    res.json({
      users,
      officers,
      inactive,
      unassigned,
      reports,
      services: {
        database: "connected",
        meta: !!config.MODEL_API_KEY,
        email: !!config.SMTP_URL,
      },
    });
  });
  router.get("/users", async (req, res) => {
    const q = parse(pageQuery, req.query),
      filter = {};
    if (q.role) filter.role = q.role;
    if (q.q)
      filter.$or = ["name", "email"].map((k) => ({
        [k]: { $regex: escapeRegex(q.q), $options: "i" },
      }));
    const [items, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      User.countDocuments(filter),
    ]);
    res.json({
      items: items.map(publicUser),
      total,
      page: q.page,
      pages: Math.max(1, Math.ceil(total / q.limit)),
    });
  });
  router.patch("/users/:id", idParam, async (req, res) => {
    const data = parse(
      z
        .object({ role: z.enum(["farmer", "officer"]), active: z.boolean() })
        .strict(),
      req.body,
    );
    const target = await User.findById(req.params.id);
    if (!target) throw new HttpError(404, "Account not found.");
    if (target.role === "admin" || target.id === req.user.id)
      throw new HttpError(
        403,
        "Administrator accounts cannot be changed here.",
      );
    if (data.role === "officer" && !target.verified)
      throw new HttpError(
        400,
        "The user must verify their email before becoming an officer.",
      );
    const result = await User.findOneAndUpdate(
      { _id: target._id, role: { $ne: "admin" } },
      { $set: data, $inc: { authVersion: 1 } },
      { new: true },
    );
    if (!result)
      throw new HttpError(
        409,
        "Account permissions changed. Refresh and retry.",
      );
    await Session.deleteMany({ user: target._id });
    await audit(req.user, "account.access_changed", target.id, {
      before: { role: target.role, active: target.active },
      after: data,
    });
    res.json({ user: publicUser(result) });
  });
  router.post("/users/:id/revoke", idParam, async (req, res) => {
    const target = await User.findById(req.params.id);
    if (!target) throw new HttpError(404, "Account not found.");
    if (target.role === "admin")
      throw new HttpError(
        403,
        "Use your account settings to sign out your own sessions.",
      );
    await User.updateOne({ _id: target._id }, { $inc: { authVersion: 1 } });
    await Session.deleteMany({ user: target._id });
    await audit(req.user, "account.sessions_revoked", target.id);
    res.json({ message: "All sessions revoked." });
  });
  router.get("/audit", async (req, res) => {
    const q = parse(pageQuery, req.query);
    const [items, total] = await Promise.all([
      Audit.find()
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      Audit.countDocuments(),
    ]);
    res.json({
      items,
      total,
      page: q.page,
      pages: Math.max(1, Math.ceil(total / q.limit)),
    });
  });
  return router;
}
