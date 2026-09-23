import { Router } from "express";
import { home, homeByDate } from "../controllers/home.js";

const r = Router();
r.get("/", home);
r.get("/by-date", homeByDate);
export default r;
