import { Router } from "express";
import { summary, project } from "../controllers/months.js";

const r = Router();
r.get("/month", summary);
r.get("/project", project);
export default r;
