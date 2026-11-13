const schemas = require("../validators/schemas");
const svc = require("../services/exportService");
const { ok } = require("../utils/response");

module.exports = {
  async json(req, res, next) {
    try {
      const data = await svc.exportJSON(req.user.id);
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="ledger-backup-${stamp}.json"`);
      return res.status(200).send(JSON.stringify(data, null, 2));
    } catch (err) { next(err); }
  },
  async csv(req, res, next) {
    try {
      const data = await svc.exportCSV(req.user.id);
      const stamp = new Date().toISOString().slice(0, 7);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="ledger-${stamp}.csv"`);
      return res.status(200).send(data);
    } catch (err) { next(err); }
  },
  async restore(req, res, next) {
    try {
      const body = schemas.restore.parse(req.body);
      const data = await svc.restore(req.user.id, body);
      return ok(res, data);
    } catch (err) { next(err); }
  },
};
