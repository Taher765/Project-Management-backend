import crypto from "crypto";
import AuthUser from "../models/AuthUser.js";

const usernameOf = value => String(value ?? "").trim();

export async function login(req, res, next) {
  try {
    const username = usernameOf(req.body?.username);
    const password = String(req.body?.password ?? "");

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "اسم المستخدم وكلمة المرور مطلوبان" });
    }

    const user = await AuthUser.findOne({ username });
    if (!user || user.password !== password) {
      return res.status(401).json({ success: false, message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    }

    // Not a JWT. This is a random login key for the requested lightweight protection.
    const loginKey = crypto.randomBytes(32).toString("hex");
    user.loginKey = loginKey;
    await user.save();

    return res.json({ success: true, data: { username: user.username, loginKey } });
  } catch (err) { next(err); }
}

export async function verify(req, res, next) {
  try {
    const username = usernameOf(req.body?.username);
    const loginKey = String(req.body?.loginKey ?? "");
    if (!username || !loginKey) {
      return res.status(400).json({ success: false, message: "بيانات التحقق ناقصة" });
    }

    const user = await AuthUser.findOne({ username, loginKey }).select("_id username");
    if (!user) return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });

    return res.json({ success: true, data: { username: user.username } });
  } catch (err) { next(err); }
}

export async function logout(req, res, next) {
  try {
    const username = usernameOf(req.body?.username);
    const loginKey = String(req.body?.loginKey ?? "");

    if (username && loginKey) {
      await AuthUser.updateOne(
        { username, loginKey },
        { $set: { loginKey: crypto.randomBytes(32).toString("hex") } }
      );
    }

    return res.json({ success: true, message: "تم تسجيل الخروج" });
  } catch (err) { next(err); }
}
