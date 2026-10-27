import { Router, raw } from "express";
import { z } from "zod";
import { Report, Message, User, Notification } from "../models.js";
import {
  parse,
  pageQuery,
  escapeRegex,
  idParam,
  objectId,
} from "../validation.js";
import {
  HttpError,
  role,
  verified,
  adminMfa,
  rateLimit,
  audit,
} from "../security.js";
export const statuses = [
  "Needs review",
  "In review",
  "Follow-up needed",
  "Closed",
];
export function reportScope(user) {
  return user.role === "admin"
    ? {}
    : user.role === "officer"
      ? { assignedTo: user._id }
      : { owner: user._id };
}
export function canRead(user, report) {
  return (
    user.role === "admin" ||
    (user.role === "officer"
      ? String(report.assignedTo?._id || report.assignedTo) === String(user._id)
      : String(report.owner?._id || report.owner) === String(user._id))
  );
}
export function decodeMedia(value, kind) {
  if (!value) return undefined;
  const match = value.match(
    /^data:([^;,]+)(?:;codecs=[a-zA-Z0-9.,-]+)?;base64,([A-Za-z0-9+/]+=*)$/,
  );
  if (!match) throw new HttpError(400, "Unsupported media format.");
  const [, mime, base64] = match,
    b = Buffer.from(base64, "base64");
  const signatures = {
    "image/jpeg": b[0] === 255 && b[1] === 216 && b[2] === 255,
    "image/png": b
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/webp":
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
    "audio/webm": b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])),
    "audio/ogg": b.toString("ascii", 0, 4) === "OggS",
    "audio/mp4": b.toString("ascii", 4, 8) === "ftyp",
    "audio/wav":
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WAVE",
  };
  if (
    !mime.startsWith(kind === "photo" ? "image/" : "audio/") ||
    !signatures[mime] ||
    !b.length ||
    b.length > (kind === "photo" ? 1500000 : 1100000)
  )
    throw new HttpError(
      400,
      "Media is unsupported or too large. Use a smaller photo or a short recording.",
    );
  return { data: b, mime, bytes: b.length };
}
const createSchema = z
  .object({
    clientId: z.string().uuid(),
    crop: z.enum(["Maize", "Cassava", "Tomato", "Cashew", "Rice", "Other"]),
    community: z.string().trim().min(2).max(100),
    symptom: z.string().trim().min(1).max(100),
    onset: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().trim().max(2000).default(""),
    affected: z.string().trim().max(100).default(""),
    audioLanguage: z
      .enum(["English", "Twi", "Dagbani", "Hausa", "Other"])
      .optional(),
    photoDataUrl: z.string().max(2000000).optional().nullable(),
    audioDataUrl: z.string().max(1500000).optional().nullable(),
    photoWidth: z.number().int().min(1).max(1200).optional(),
    photoHeight: z.number().int().min(1).max(1200).optional(),
  })
  .strict();
export function reportsRouter(meta) {
  const router = Router();
  router.use(verified);
  async function load(req, withMedia = false) {
    const query = Report.findOne({
      _id: req.params.id,
      ...reportScope(req.user),
    });
    if (withMedia) query.select("+photo.data +audio.data");
    const report = await query;
    if (!report) throw new HttpError(404, "Report not found.");
    return report;
  }
  const notify = async (user, report, text) => {
    if (user) await Notification.create({ user, report, text });
  };
  router.get("/", async (req, res) => {
    const q = parse(pageQuery, req.query),
      filter = reportScope(req.user);
    if (q.status) filter.status = q.status;
    if (q.q)
      filter.$or = ["crop", "community"].map((k) => ({
        [k]: { $regex: escapeRegex(q.q), $options: "i" },
      }));
    const [items, total] = await Promise.all([
      Report.find(filter)
        .select("-ai")
        .populate("owner", "name")
        .populate("assignedTo", "name")
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      Report.countDocuments(filter),
    ]);
    res.json({
      items,
      total,
      page: q.page,
      pages: Math.max(1, Math.ceil(total / q.limit)),
    });
  });
  router.get("/summary", async (req, res) => {
    const scope = reportScope(req.user),
      group = await Report.aggregate([
        { $match: scope },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);
    const counts = Object.fromEntries(
      statuses.map((s) => [s, group.find((g) => g._id === s)?.count || 0]),
    );
    const recent = await Report.find(scope)
      .select("crop community status createdAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    res.json({
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      recent,
    });
  });
  router.post(
    "/",
    role("farmer"),
    rateLimit("report-create", 10, 3600),
    async (req, res) => {
      const data = parse(createSchema, req.body);
      if (!data.description && !data.audioDataUrl)
        throw new HttpError(400, "Add a description or voice note.");
      if (data.audioDataUrl && !data.audioLanguage)
        throw new HttpError(400, "Choose the recording language.");
      if (
        !Number.isFinite(Date.parse(data.onset)) ||
        new Date(data.onset).toISOString().slice(0, 10) !== data.onset ||
        data.onset > new Date().toISOString().slice(0, 10)
      )
        throw new HttpError(
          400,
          "Observation date must be valid and not in the future.",
        );
      let existing = await Report.findOne({
        owner: req.user._id,
        clientId: data.clientId,
      });
      if (existing) return res.json({ report: existing });
      const photo = decodeMedia(data.photoDataUrl, "photo"),
        audio = decodeMedia(data.audioDataUrl, "audio");
      if (photo) {
        photo.width = data.photoWidth;
        photo.height = data.photoHeight;
      }
      const { photoDataUrl, audioDataUrl, photoWidth, photoHeight, ...fields } =
        data;
      let report;
      try {
        report = await Report.create({
          ...fields,
          owner: req.user._id,
          photo,
          audio,
        });
      } catch (e) {
        if (e.code !== 11000) throw e;
        report = await Report.findOne({
          owner: req.user._id,
          clientId: data.clientId,
        });
      }
      await audit(req.user, "report.submitted", report.id);
      res.status(201).json({ report: await Report.findById(report._id) });
    },
  );
  router.param("id", (req, res, next) => idParam(req, res, next));
  router.get("/:id", async (req, res) => {
    const report = await load(req);
    await report.populate([
      { path: "owner", select: "name community" },
      { path: "assignedTo", select: "name" },
    ]);
    res.json({ report });
  });
  router.get("/:id/messages", async (req, res) => {
    await load(req);
    const q = parse(pageQuery, req.query);
    const total = await Message.countDocuments({ report: req.params.id });
    const items = await Message.find({ report: req.params.id })
      .sort({ createdAt: -1, _id: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean();
    res.json({
      items: items.reverse(),
      total,
      page: q.page,
      pages: Math.max(1, Math.ceil(total / q.limit)),
    });
  });
  router.post(
    "/:id/messages",
    rateLimit("message-create", 30, 60),
    async (req, res) => {
      const report = await load(req);
      const data = parse(
        z
          .object({
            text: z.string().trim().min(1).max(2000),
            clientId: z.string().uuid(),
          })
          .strict(),
        req.body,
      );
      let message = await Message.findOne({
        report: report._id,
        clientId: data.clientId,
      });
      if (message) {
        if (String(message.author) !== req.user.id)
          throw new HttpError(409, "Message identifier is already used.");
        return res.json({ message });
      }
      try {
        message = await Message.create({
          ...data,
          report: report._id,
          author: req.user._id,
          authorName: req.user.name,
          role: req.user.role,
        });
      } catch (e) {
        if (e.code !== 11000) throw e;
        message = await Message.findOne({
          report: report._id,
          clientId: data.clientId,
        });
        if (!message || String(message.author) !== req.user.id)
          throw new HttpError(409, "Message identifier is already used.");
        return res.json({ message });
      }
      await Report.updateOne(
        { _id: report._id },
        { $set: { lastMessageAt: new Date() } },
      );
      await notify(
        req.user.role === "farmer" ? report.assignedTo : report.owner,
        report._id,
        req.user.role === "farmer"
          ? "A farmer added an update."
          : "Your extension team sent feedback.",
      );
      await audit(req.user, "report.message_sent", report.id);
      res.status(201).json({ message });
    },
  );
  router.patch("/:id", role("officer", "admin"), async (req, res) => {
    const report = await load(req);
    const data = parse(
      z
        .object({
          version: z.number().int().min(0),
          status: z.enum(statuses),
          priority: z.enum(["normal", "high"]),
        })
        .strict(),
      req.body,
    );
    const updated = await Report.findOneAndUpdate(
      { _id: report._id, version: data.version },
      {
        $set: { status: data.status, priority: data.priority },
        $inc: { version: 1 },
      },
      { new: true },
    );
    if (!updated)
      throw new HttpError(
        409,
        "This report changed. Refresh it before saving.",
      );
    await audit(req.user, "report.review_updated", report.id, {
      status: data.status,
      priority: data.priority,
    });
    await notify(
      report.owner,
      report._id,
      "Your report status is now " + data.status.toLowerCase() + ".",
    );
    res.json({ report: updated });
  });
  router.patch("/:id/assignment", role("admin"), adminMfa, async (req, res) => {
    const report = await load(req);
    const data = parse(
      z
        .object({
          officerId: objectId.nullable(),
          version: z.number().int().min(0),
        })
        .strict(),
      req.body,
    );
    if (
      data.officerId &&
      !(await User.exists({
        _id: data.officerId,
        role: "officer",
        active: true,
        verified: true,
      }))
    )
      throw new HttpError(400, "Choose an active, verified officer.");
    const updated = await Report.findOneAndUpdate(
      { _id: report._id, version: data.version },
      { $set: { assignedTo: data.officerId }, $inc: { version: 1 } },
      { new: true },
    );
    if (!updated)
      throw new HttpError(409, "Assignment changed. Refresh and try again.");
    await audit(req.user, "report.assigned", report.id, {
      officerId: data.officerId,
    });
    await notify(
      data.officerId,
      report._id,
      "A crop report has been assigned to you.",
    );
    res.json({ report: updated });
  });
  router.get("/:id/media/:kind", async (req, res) => {
    const report = await load(req, true),
      kind = req.params.kind;
    if (!["photo", "audio"].includes(kind) || !report[kind]?.data)
      throw new HttpError(404, "Attachment not found.");
    const media = report[kind],
      buffer = media.data;
    res.set({
      "Content-Type": media.mime,
      "Content-Disposition": "inline",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    });
    const range = req.get("range");
    if (range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = Number(m?.[1]),
        end = m?.[2] ? Number(m[2]) : buffer.length - 1;
      if (!m || start > end || start >= buffer.length || end >= buffer.length)
        return res
          .status(416)
          .set("Content-Range", `bytes */${buffer.length}`)
          .end();
      return res
        .status(206)
        .set({
          "Content-Range": `bytes ${start}-${end}/${buffer.length}`,
          "Content-Length": String(end - start + 1),
        })
        .send(buffer.subarray(start, end + 1));
    }
    res.set("Content-Length", String(buffer.length)).send(buffer);
  });
  router.post(
    "/:id/ai/:kind",
    role("officer", "admin"),
    rateLimit("ai-user", 10, 3600),
    rateLimit("ai-site", 100, 3600, () => "site"),
    raw({ type: "audio/wav", limit: "1mb" }),
    async (req, res) => {
      const report = await load(req, true),
        kind = req.params.kind;
      if (!["brief", "segment", "transcribe"].includes(kind))
        throw new HttpError(404, "AI action not found.");
      if (
        kind === "transcribe" &&
        (!report.audio?.data || report.audioLanguage !== "English")
      )
        throw new HttpError(
          400,
          "English audio is required for automatic transcription. Other recordings need human listening.",
        );
      const result = await meta[kind](
        kind === "transcribe" ? req.body : report,
      );
      const field = {
        brief: "brief",
        segment: "segmentation",
        transcribe: "transcript",
      }[kind];
      await Report.updateOne(
        { _id: report._id },
        { $set: { ["ai." + field]: result } },
      );
      await audit(req.user, "ai." + kind, report.id, {
        model: result.model,
        elapsedMs: result.elapsedMs,
      });
      res.json({ result });
    },
  );
  return router;
}
