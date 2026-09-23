import mongoose from "mongoose";

export function projectIdOf(req) {
  return req.headers["x-project-id"] || req.query.projectId || req.body?.projectId || null;
}

export function requireProjectId(req) {
  const id = projectIdOf(req);
  if (!id || !mongoose.isValidObjectId(id)) {
    throw Object.assign(new Error("A valid projectId is required"), { statusCode: 400, code: "PROJECT_ID_REQUIRED" });
  }
  return id;
}
