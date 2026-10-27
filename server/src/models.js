import mongoose from "mongoose";
const { Schema, model } = mongoose;
const ref = { type: Schema.Types.ObjectId, ref: "User" };
const userSchema = new Schema(
  {
    name: { type: String, required: true, maxLength: 100 },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["farmer", "officer", "admin"],
      default: "farmer",
      index: true,
    },
    active: { type: Boolean, default: true },
    verified: { type: Boolean, default: false },
    community: { type: String, default: "" },
    authVersion: { type: Number, default: 0 },
    mfaSecret: { type: String, select: false },
    mfaPending: { type: String, select: false },
    mfaPendingAt: { type: Date, select: false },
    mfaRecoveryHashes: { type: [String], select: false },
    mfaEnabled: { type: Boolean, default: false },
    lastTotp: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);
export const User = model("User", userSchema);
export const Session = model(
  "Session",
  new Schema(
    {
      tokenHash: { type: String, unique: true },
      user: ref,
      csrf: String,
      authVersion: Number,
      expiresAt: { type: Date, index: { expires: 0 } },
      lastSeen: Date,
    },
    { timestamps: true },
  ),
);
export const ActionToken = model(
  "ActionToken",
  new Schema(
    {
      tokenHash: { type: String, unique: true },
      user: ref,
      purpose: { type: String, enum: ["verify", "reset"] },
      expiresAt: { type: Date, index: { expires: 0 } },
    },
    { timestamps: true },
  ),
);
export const RateBucket = model(
  "RateBucket",
  new Schema(
    {
      _id: String,
      count: Number,
      expiresAt: { type: Date, index: { expires: 0 } },
    },
    { versionKey: false },
  ),
);
const mediaSchema = new Schema(
  {
    data: { type: Buffer, select: false },
    mime: String,
    bytes: Number,
    width: Number,
    height: Number,
  },
  { _id: false },
);
const reportSchema = new Schema(
  {
    owner: { ...ref, required: true, index: true },
    assignedTo: { ...ref, index: true },
    clientId: { type: String, required: true },
    crop: String,
    community: String,
    symptom: String,
    onset: String,
    description: String,
    affected: String,
    audioLanguage: String,
    photo: mediaSchema,
    audio: mediaSchema,
    status: {
      type: String,
      enum: ["Needs review", "In review", "Follow-up needed", "Closed"],
      default: "Needs review",
      index: true,
    },
    priority: { type: String, enum: ["normal", "high"], default: "normal" },
    version: { type: Number, default: 0 },
    ai: { type: Schema.Types.Mixed, default: {} },
    lastMessageAt: Date,
  },
  { timestamps: true },
);
reportSchema.index({ owner: 1, clientId: 1 }, { unique: true });
reportSchema.index({ assignedTo: 1, createdAt: -1 });
reportSchema.index({ owner: 1, createdAt: -1 });
export const Report = model("Report", reportSchema);
const messageSchema = new Schema(
  {
    report: { type: Schema.Types.ObjectId, ref: "Report", index: true },
    author: ref,
    authorName: String,
    role: String,
    text: String,
    clientId: String,
  },
  { timestamps: true },
);
messageSchema.index({ report: 1, clientId: 1 }, { unique: true });
export const Message = model("Message", messageSchema);
export const Audit = model(
  "Audit",
  new Schema(
    {
      actor: ref,
      actorName: String,
      action: String,
      target: String,
      details: Schema.Types.Mixed,
    },
    { timestamps: true },
  ),
);
export const Notification = model(
  "Notification",
  new Schema(
    {
      user: { ...ref, index: true },
      report: { type: Schema.Types.ObjectId, ref: "Report" },
      text: String,
      readAt: Date,
    },
    { timestamps: true },
  ),
);
export async function ensureIndexes() {
  await Promise.all(
    [
      User,
      Session,
      ActionToken,
      RateBucket,
      Report,
      Message,
      Audit,
      Notification,
    ].map((m) => m.init()),
  );
}
