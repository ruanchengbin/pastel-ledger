const schemas = require("../validators/schemas");
const svc = require("../services/transactionService");
const { ok, created } = require("../utils/response");

module.exports = {
  async create(req, res, next) {
    try {
      const body = schemas.transactionCreate.parse(req.body);
      const data = await svc.createOne(req.user.id, body);
      return created(res, data);
    } catch (err) { next(err); }
  },

  async batchCreate(req, res, next) {
    try {
      const body = schemas.batchTransactions.parse(req.body);
      const data = await svc.batchCreate(req.user.id, body.items);
      return ok(res, data);
    } catch (err) { next(err); }
  },

  async list(req, res, next) {
    try {
      const q = req.query;
      let accountIds = null;
      if (q.account_ids && q.account_ids.trim()) {
        accountIds = q.account_ids.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      }
      const data = await svc.listByMonth(req.user.id, {
        month: q.month,
        type: q.type,
        category_ids: q.category_ids ? q.category_ids.split(",").filter(Boolean) : null,
        keyword: q.keyword,
        min_amount: q.min_amount,
        max_amount: q.max_amount,
        cursor: q.cursor,
        limit: parseInt(q.limit || "20", 10),
        account_ids: accountIds,
      });
      return ok(res, data);
    } catch (err) { next(err); }
  },

  async get(req, res, next) {
    try {
      const data = await svc.findOne(req.user.id, req.params.id);
      return ok(res, data);
    } catch (err) { next(err); }
  },

  async update(req, res, next) {
    try {
      const body = schemas.transactionUpdate.parse(req.body);
      const ifMatch = req.headers["if-match"];
      const data = await svc.updateOne(req.user.id, req.params.id, body, ifMatch);
      return ok(res, data);
    } catch (err) { next(err); }
  },

  async del(req, res, next) {
    try {
      const data = await svc.softDelete(req.user.id, req.params.id);
      return ok(res, data);
    } catch (err) { next(err); }
  },

  async restore(req, res, next) {
    try {
      const data = await svc.restore(req.user.id, req.params.id);
      return ok(res, data);
    } catch (err) { next(err); }
  },
};
