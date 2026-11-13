const svc = require("../services/linkService");
const { ok } = require("../utils/response");

module.exports = {
  async list(req, res, next) {
    try {
      const data = await svc.listAll(req.user.id);
      return ok(res, {
        self_email: req.user.email,
        items: data,
      });
    } catch (err) { next(err); }
  },

  async request(req, res, next) {
    try {
      const data = await svc.request({
        requesterId: req.user.id,
        targetEmail: req.body.email,
        message: req.body.message,
      });
      return ok(res, {
        self_email: req.user.email,
        items: data,
      });
    } catch (err) { next(err); }
  },

  async accept(req, res, next) {
    try {
      const data = await svc.update({ userId: req.user.id, linkId: req.params.id, action: "accept" });
      return ok(res, { self_email: req.user.email, items: data });
    } catch (err) { next(err); }
  },

  async reject(req, res, next) {
    try {
      const data = await svc.update({ userId: req.user.id, linkId: req.params.id, action: "reject" });
      return ok(res, { self_email: req.user.email, items: data });
    } catch (err) { next(err); }
  },

  async cancel(req, res, next) {
    try {
      const data = await svc.update({ userId: req.user.id, linkId: req.params.id, action: "cancel" });
      return ok(res, { self_email: req.user.email, items: data });
    } catch (err) { next(err); }
  },

  async revoke(req, res, next) {
    try {
      const data = await svc.update({ userId: req.user.id, linkId: req.params.id, action: "revoke" });
      return ok(res, { self_email: req.user.email, items: data });
    } catch (err) { next(err); }
  },
};
