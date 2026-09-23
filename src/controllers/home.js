import { currentWeek, requireExistingWeek } from "../utils/weekService.js";
import { serializeHome } from "../utils/homeService.js";
import { isFuture } from "../utils/date.js";
import { requireProjectId } from "../utils/project.js";

export async function home(req, res, next) {
  try { const projectId = requireProjectId(req); res.json({ success: true, data: await serializeHome(await currentWeek(projectId)) }); }
  catch (e) { next(e); }
}

export async function homeByDate(req, res, next) {
  try {
    const projectId = requireProjectId(req);
    const target = req.query.date;
    if (isFuture(target)) return res.status(400).json({ success: false, error: { code: "FUTURE_DATE_NOT_ALLOWED" } });
    res.json({ success: true, data: await serializeHome(await requireExistingWeek(projectId, target)) });
  } catch (e) { next(e); }
}
