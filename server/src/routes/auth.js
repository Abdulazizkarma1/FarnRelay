import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { User, Session, ActionToken } from "../models.js";
import { email, password, parse } from "../validation.js";
import {
  secret,
  digest,
  passwordHash,
  passwordMatches,
  HttpError,
  publicUser,
  cookieName,
  cookieOptions,
  openSession,
  authenticate,
  csrf,
  rateLimit,
  audit,
  encrypt,
  decrypt,
  base32,
  matchTotp,
} from "../security.js";
const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
    otp: z.string().max(6).optional(),
    recoveryCode: z.string().max(32).optional(),
  })
  .strict();
export function authRouter(config, mailer) {
  const router = Router();
  const dummy = passwordHash("unused-timing-comparison-password");
  const ipLimit = rateLimit("authentication-ip", 30, 900, (req) => req.ip);
  const accountLimit = rateLimit("authentication-account", 12, 900, (req) =>
    String(req.body?.email || "").toLowerCase(),
  );
  async function mailToken(user, purpose) {
    const token = secret();
    await ActionToken.create({
      tokenHash: digest(token),
      user: user._id,
      purpose,
      expiresAt: new Date(
        Date.now() + (purpose === "reset" ? 30 : 1440) * 60000,
      ),
    });
    await mailer({
      to: user.email,
      subject:
        purpose === "reset"
          ? "Reset your FarmRelay password"
          : "Verify your FarmRelay email",
      text: `${purpose === "reset" ? "Reset your password" : "Verify your email"} using this private link:\n${config.APP_ORIGIN}/#${purpose}?token=${token}\n\nIf you did not request this, ignore this email. Do not share this link.`,
    });
  }
  router.post("/register", ipLimit, async (req, res) => {
    const data = parse(
      z
        .object({
          name: z.string().trim().min(2).max(100),
          email,
          password,
          community: z.string().trim().max(100).default(""),
        })
        .strict(),
      req.body,
    );
    if (await User.exists({ email: data.email }))
      return res
        .status(202)
        .json({
          message:
            "If this address can be registered, a verification email will arrive. Existing users can sign in or reset their password.",
        });
    let user;
    try {
      user = await User.create({
        ...data,
        password: undefined,
        passwordHash: await passwordHash(data.password),
      });
    } catch (e) {
      if (e.code === 11000)
        return res
          .status(202)
          .json({
            message:
              "Check your email or sign in if you already have an account.",
          });
      throw e;
    }
    await audit(user, "account.registered", user.id);
    try {
      await mailToken(user, "verify");
    } catch {
      throw new HttpError(
        503,
        "Your account was created, but email delivery failed. Sign in and use Resend verification.",
      );
    }
    res
      .status(201)
      .json({
        message:
          "Account created. Check your email to verify your address, then sign in.",
      });
  });
  router.post("/login", ipLimit, accountLimit, async (req, res) => {
    const data = parse(loginSchema, req.body);
    const user = await User.findOne({ email: data.email }).select(
      "+passwordHash +mfaSecret +lastTotp +mfaRecoveryHashes",
    );
    const valid = await passwordMatches(
      data.password,
      user?.passwordHash || (await dummy),
    );
    if (!valid || !user?.active)
      throw new HttpError(401, "Email or password is incorrect.");
    if (user.mfaEnabled) {
      if (!data.otp && !data.recoveryCode)
        throw new HttpError(
          401,
          "Enter the six-digit code from your authenticator.",
          "MFA_REQUIRED",
        );
      if (data.recoveryCode) {
        const changed = await User.updateOne(
          {
            _id: user._id,
            mfaRecoveryHashes: digest(data.recoveryCode.trim()),
          },
          { $pull: { mfaRecoveryHashes: digest(data.recoveryCode.trim()) } },
        );
        if (!changed.modifiedCount)
          throw new HttpError(401, "Recovery code is invalid or already used.");
      } else {
        const counter = matchTotp(
          decrypt(user.mfaSecret, config.APP_SECRET),
          data.otp,
        );
        if (counter === null)
          throw new HttpError(401, "Authenticator code is incorrect.");
        const changed = await User.updateOne(
          { _id: user._id, lastTotp: { $lt: counter } },
          { $set: { lastTotp: counter } },
        );
        if (!changed.modifiedCount)
          throw new HttpError(
            401,
            "This code was already used. Wait for the next code.",
          );
      }
    }
    if (req.cookies[cookieName(config)])
      await Session.deleteOne({
        tokenHash: digest(req.cookies[cookieName(config)]),
      });
    const result = await openSession(req, res, user, config);
    await audit(user, "session.signed_in", user.id);
    res.json(result);
  });
  router.post("/forgot", ipLimit, accountLimit, async (req, res) => {
    const data = parse(z.object({ email }).strict(), req.body);
    const user = await User.findOne({ email: data.email, active: true });
    if (user) {
      try {
        await mailToken(user, "reset");
      } catch {
        req.log?.warn("Password reset email delivery failed");
      }
    }
    res.json({
      message:
        "If an active account exists, a reset link will arrive by email.",
    });
  });
  router.post("/reset", ipLimit, async (req, res) => {
    const data = parse(
      z
        .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password })
        .strict(),
      req.body,
    );
    const hashed = await passwordHash(data.password);
    const token = await ActionToken.findOneAndDelete({
      tokenHash: digest(data.token),
      purpose: "reset",
      expiresAt: { $gt: new Date() },
    });
    if (!token)
      throw new HttpError(
        400,
        "This reset link is expired or has already been used.",
      );
    const user = await User.findByIdAndUpdate(
      token.user,
      { $set: { passwordHash: hashed }, $inc: { authVersion: 1 } },
      { new: true },
    );
    await Promise.all([
      Session.deleteMany({ user: token.user }),
      ActionToken.deleteMany({ user: token.user, purpose: "reset" }),
    ]);
    await audit(user, "account.password_reset", token.user);
    res.json({
      message:
        "Password changed. Sign in again. Authenticator protection remains enabled.",
    });
  });
  router.post("/verify", ipLimit, async (req, res) => {
    const data = parse(
      z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
      req.body,
    );
    const token = await ActionToken.findOneAndDelete({
      tokenHash: digest(data.token),
      purpose: "verify",
      expiresAt: { $gt: new Date() },
    });
    if (!token)
      throw new HttpError(
        400,
        "This verification link is expired or already used.",
      );
    await User.updateOne({ _id: token.user }, { $set: { verified: true } });
    res.json({ message: "Email verified. You can now submit reports." });
  });
  router.use(authenticate(config), csrf);
  router.get("/me", (req, res) =>
    res.json({ user: publicUser(req.user), csrf: req.session.csrf }),
  );
  router.post("/logout", async (req, res) => {
    await Session.deleteOne({ _id: req.session._id });
    res.clearCookie(cookieName(config), cookieOptions(config));
    res.json({ message: "Signed out." });
  });
  router.post("/logout-all", async (req, res) => {
    await User.updateOne({ _id: req.user._id }, { $inc: { authVersion: 1 } });
    await Session.deleteMany({ user: req.user._id });
    res.clearCookie(cookieName(config), cookieOptions(config));
    res.json({ message: "All sessions signed out." });
  });
  router.post(
    "/resend",
    rateLimit("verify-email", 3, 3600),
    async (req, res) => {
      if (!req.user.verified) {
        try {
          await mailToken(req.user, "verify");
        } catch {
          throw new HttpError(
            503,
            "Email delivery is unavailable. Please retry later.",
          );
        }
      }
      res.json({
        message: "If verification is needed, an email has been sent.",
      });
    },
  );
  router.patch("/profile", async (req, res) => {
    const data = parse(
      z
        .object({
          name: z.string().trim().min(2).max(100),
          community: z.string().trim().max(100),
        })
        .strict(),
      req.body,
    );
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: data },
      { new: true },
    );
    res.json({ user: publicUser(user) });
  });
  router.post(
    "/password",
    rateLimit("password-change", 5, 900),
    async (req, res) => {
      const data = parse(
        z.object({ currentPassword: z.string().max(128), password }).strict(),
        req.body,
      );
      const user = await User.findById(req.user._id).select("+passwordHash");
      if (!(await passwordMatches(data.currentPassword, user.passwordHash)))
        throw new HttpError(400, "Current password is incorrect.");
      user.passwordHash = await passwordHash(data.password);
      user.authVersion++;
      await user.save();
      await Session.deleteMany({ user: user._id });
      await audit(user, "account.password_changed", user.id);
      res.json(await openSession(req, res, user, config));
    },
  );
  router.post(
    "/mfa/setup",
    rateLimit("mfa-setup", 5, 900),
    async (req, res) => {
      const data = parse(
        z.object({ password: z.string().max(128) }).strict(),
        req.body,
      );
      const user = await User.findById(req.user._id).select("+passwordHash");
      if (user.mfaEnabled)
        throw new HttpError(
          409,
          "Authenticator protection is already enabled.",
        );
      if (!(await passwordMatches(data.password, user.passwordHash)))
        throw new HttpError(400, "Password is incorrect.");
      const bytes = randomBytes(20);
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            mfaPending: encrypt(bytes.toString("hex"), config.APP_SECRET),
            mfaPendingAt: new Date(),
          },
        },
      );
      res.json({ secret: base32(bytes) });
    },
  );
  router.post(
    "/mfa/confirm",
    rateLimit("mfa-confirm", 6, 900),
    async (req, res) => {
      const data = parse(
        z.object({ otp: z.string().regex(/^\d{6}$/) }).strict(),
        req.body,
      );
      const user = await User.findById(req.user._id).select(
        "+mfaPending +mfaPendingAt",
      );
      if (
        !user.mfaPending ||
        Date.now() - user.mfaPendingAt.getTime() > 10 * 60000
      )
        throw new HttpError(400, "Authenticator setup expired. Start again.");
      const counter = matchTotp(
        decrypt(user.mfaPending, config.APP_SECRET),
        data.otp,
      );
      if (counter === null)
        throw new HttpError(400, "Authenticator code is incorrect.");
      const codes = Array.from({ length: 8 }, () =>
        randomBytes(8).toString("hex"),
      );
      const updated = await User.findOneAndUpdate(
        { _id: user._id, mfaEnabled: false, mfaPending: user.mfaPending },
        {
          $set: {
            mfaEnabled: true,
            mfaSecret: user.mfaPending,
            lastTotp: counter,
            mfaRecoveryHashes: codes.map(digest),
          },
          $unset: { mfaPending: 1, mfaPendingAt: 1 },
          $inc: { authVersion: 1 },
        },
        { new: true },
      );
      if (!updated)
        throw new HttpError(
          409,
          "Authenticator setup changed. Refresh your account.",
        );
      await Session.deleteMany({ user: user._id });
      await audit(user, "account.mfa_enabled", user.id);
      res.json({
        ...(await openSession(req, res, updated, config)),
        recoveryCodes: codes,
      });
    },
  );
  return router;
}
