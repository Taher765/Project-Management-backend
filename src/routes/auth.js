import { Router } from "express";
import { login, verify, logout } from "../controllers/authController.js";

const r = Router();
r.post("/login", login);
r.post("/verify", verify);
r.post("/logout", logout);
export default r;
