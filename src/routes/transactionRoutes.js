import { Router } from "express";
import { update, remove } from "../controllers/transactions.js";

const r = Router();
r.patch("/:id", update);
r.delete("/:id", remove);
export default r;
