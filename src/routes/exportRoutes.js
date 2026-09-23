import { Router } from "express";
import { worker, week, month, finances } from "../controllers/exports.js";
const r = Router();
r.get("/worker/:workerId", worker);
r.get("/week", week);
r.get("/month", month);
r.get("/finances", finances);
r.get("/project", finances);
export default r;
