const schemas = require("../validators/schemas");
const svc = require("../services/categoryService");
const { ok, created } = require("../utils/response");

module.exports = {
  async list(req, res, next) {
    try {
      const data = await svc.listAll(req.user.id, req.query.type || null);
      return ok(res, data);
    } catch (err) { next(err); }
  },
  async create(req, res, next) {
    try {
      const body = schemas.categoryBase.parse(req.body);
      const data = await svc.createOne(req.user.id, body);
      return created(res, data);
    } catch (err) { next(err); }
  },
  async update(req, res, next) {
    try {
      const body = schemas.categoryUpdate.parse(req.body);
      const data = await svc.updateOne(req.user.id, req.params.id, body);
      return ok(res, data);
    } catch (err) { next(err); }
  },
  async del(req, res, next) {
    try {
      const data = await svc.deleteOne(req.user.id, req.params.id);
      return ok(res, data);
    } catch (err) { next(err); }
  },
  async migrate(req, res, next) {
    try {
      const body = schemas.categoryMigrate.parse(req.body);
      const data = await svc.migrateCategory(req.user.id, req.params.id, body.target_id);
      return ok(res, data);
    } catch (err) { next(err); }
  },
  async reorder(req, res, next) {
    try {
      const body = schemas.categoryOrder.parse(req.body);
      const data = await svc.reorder(req.user.id, body.type, body.orders);
      return ok(res, data);
    } catch (err) { next(err); }
  },
};
