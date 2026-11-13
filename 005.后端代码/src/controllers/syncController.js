const schemas = require("../validators/schemas");
const svc = require("../services/syncService");
const { ok } = require("../utils/response");

module.exports = {
  async pull(req, res, next) {
    try {
      const data = await svc.pull(req.user.id, req.query.since || "1970-01-01T00:00:00Z");
      return ok(res, data);
    } catch (err) { next(err); }
  },
  async push(req, res, next) {
    try {
      const body = schemas.syncPush.parse(req.body);
      const data = await svc.push(req.user.id, body);
      return ok(res, data);
    } catch (err) { next(err); }
  },
  async full(req, res, next) {
    try {
      const includePartners = req.query.include_partners === "1" || req.query.include_partners === "true";
      const data = await svc.full(req.user.id, { include_partners: includePartners });
      return ok(res, data);
    } catch (err) { next(err); }
  },
};
