import { Router } from "express";
import { current, previous, next, showByDate, toggleClose, archive } from "../controllers/weeks.js";

const r = Router();
r.get("/current", current);
r.get("/previous", previous);
r.get("/next", next);
r.get("/by-date/:date", showByDate);
r.get("/archive", archive);
r.patch("/:id/close", toggleClose);
export default r;
