const schemas = require("../validators/schemas");
const svc = require("../services/budgetService");
const { ok } = require("../utils/response");

module.exports = {
  async get(req, res, next) {
    try {
      const data = await svc.getConfig(req.user.id);
      return ok(res, data);
    } catch (err) { next(err); }
  },
  async save(req, res, next) {
    try {
      const body = schemas.budgetSave.parse(req.body);
      const data = await svc.saveConfig(req.user.id, body);
      return ok(res, data);
    } catch (err) { next(err); }
  },
  async progress(req, res, next) {
    try {
      const data = await svc.getProgress(req.user.id, req.query.reference);
      return ok(res, data);
    } catch (err) { next(err); }
  },
};
