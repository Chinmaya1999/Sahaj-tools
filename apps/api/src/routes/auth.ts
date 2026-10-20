import { Router } from "express";
import { hash, verify } from "@node-rs/argon2";
import { forgotSchema, loginSchema, registerSchema, resetSchema } from "@ek/shared";
import { COOKIE, clearSessionCookie, createSession, requireAuth } from "../lib/auth.js";
import { conflict, parse, unauthorized, wrap, HttpError } from "../lib/http.js";
import { randomToken, sha256 } from "../lib/security.js";
import { PasswordReset, Session, User } from "../models/index.js";
import { audit } from "../services/audit.js";
import { sendMail } from "../services/mail.js";
import { env } from "../env.js";

export const authRouter = Router();
// A real hash so unknown-email logins cost the same as real ones (no timing oracle).
const dummyHash = hash("not-a-real-password-just-timing");
export const publicUser = (u: { id: string; email: string; name: string; role: string }) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

authRouter.post("/register", wrap(async (req, res) => {
  const body = parse(registerSchema, req.body);
  if (await User.exists({ email: body.email })) throw conflict("An account with this email already exists", "email_taken");
  const passwordHash = await hash(body.password);
  let user;
  try { user = await User.create({ email: body.email, name: body.name, passwordHash }); }
  catch (e: any) { if (e?.code === 11000) throw conflict("An account with this email already exists", "email_taken"); throw e; }
  await createSession(res, user._id, req.get("user-agent"));
  await audit(req, "auth.register", user.id, undefined, user._id);
  res.status(201).json({ user: publicUser(user) });
}));

authRouter.post("/login", wrap(async (req, res) => {
  const body = parse(loginSchema, req.body);
  const user = await User.findOne({ email: body.email });
  const ok = await verify(user?.passwordHash ?? (await dummyHash), body.password).catch(() => false);
  if (!user || !ok) { await audit(req, "auth.login_failed", body.email); throw unauthorized("Incorrect email or password"); }
  if (user.disabled) { await audit(req, "auth.login_blocked", user.id, undefined, user._id); throw new HttpError(403, "This account has been suspended. Please contact support.", "suspended"); }
  user.lastLoginAt = new Date(); await user.save();
  await createSession(res, user._id, req.get("user-agent"));
  await audit(req, "auth.login", user.id, undefined, user._id);
  res.json({ user: publicUser(user) });
}));

authRouter.post("/logout", wrap(async (req, res) => {
  const t = req.cookies?.[COOKIE];
  if (typeof t === "string") await Session.deleteOne({ tokenHash: sha256(t) });
  clearSessionCookie(res);
  res.json({ ok: true });
}));

authRouter.get("/me", wrap(async (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
}));

authRouter.post("/forgot", wrap(async (req, res) => {
  const { email } = parse(forgotSchema, req.body);
  const user = await User.findOne({ email });
  if (user) {
    const token = randomToken(32);
    await PasswordReset.create({ tokenHash: sha256(token), user: user._id, expiresAt: new Date(Date.now() + 30 * 60_000) });
    const link = `${env.WEB_ORIGIN}/reset-password?token=${token}`;
    await sendMail(user.email, "Reset your Sahaj password", `Use this link within 30 minutes to choose a new password:\n\n${link}\n\nIf you did not request this, ignore this email.`);
    await audit(req, "auth.reset_requested", user.id, undefined, user._id);
  }
  // Same response either way – do not reveal which emails are registered.
  res.json({ ok: true, message: "If that email is registered, a reset link has been sent." });
}));

authRouter.post("/reset", wrap(async (req, res) => {
  const { token, password } = parse(resetSchema, req.body);
  const rec = await PasswordReset.findOneAndUpdate(
    { tokenHash: sha256(token), usedAt: null, expiresAt: { $gt: new Date() } },
    { usedAt: new Date() },
  ); // atomic: single use
  if (!rec) throw new HttpError(400, "This reset link is invalid or has expired", "bad_token");
  await User.updateOne({ _id: rec.user }, { passwordHash: await hash(password) });
  await Session.deleteMany({ user: rec.user }); // sign out everywhere
  await audit(req, "auth.password_reset", String(rec.user), undefined, rec.user);
  res.json({ ok: true });
}));

authRouter.post("/change-password", requireAuth, wrap(async (req, res) => {
  const { current, password } = parse(resetSchema.pick({ password: true }).extend({ current: loginSchema.shape.password }), req.body);
  const user = await User.findById(req.user!._id);
  if (!user || !(await verify(user.passwordHash, current).catch(() => false))) throw unauthorized("Current password is incorrect");
  user.passwordHash = await hash(password); await user.save();
  const keep = req.cookies?.[COOKIE];
  await Session.deleteMany({ user: user._id, tokenHash: { $ne: sha256(String(keep)) } });
  await audit(req, "auth.password_changed");
  res.json({ ok: true });
}));
