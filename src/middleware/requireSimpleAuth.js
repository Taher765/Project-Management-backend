import AuthUser from "../models/AuthUser.js";

export default async function requireSimpleAuth(req, res, next) {
  try {
    const username = String(req.headers["x-username"] ?? req.body?.username ?? "").trim();
    const loginKey = String(req.headers["x-login-key"] ?? req.body?.loginKey ?? "");

    if (!username || !loginKey) {
      return res.status(401).json({ success: false, message: "غير مصرح. سجل الدخول أولاً" });
    }

    const user = await AuthUser.findOne({ username, loginKey }).select("_id username");
    if (!user) return res.status(401).json({ success: false, message: "جلسة الدخول غير صالحة" });

    req.authUser = user;
    next();
  } catch (err) { next(err); }
}
