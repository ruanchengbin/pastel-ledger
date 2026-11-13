const schemas = require("../validators/schemas");
const svc = require("../services/accountService");
const { ok } = require("../utils/response");

module.exports = {
  async me(req, res, next) {
    try { const data = await svc.getMe(req.user.id); return ok(res, data); } catch (err) { next(err); }
  },
  async changeName(req, res, next) {
    try {
      const body = schemas.changeName.parse(req.body);
      const data = await svc.changeName(req.user.id, body.name);
      return ok(res, data);
    } catch (err) { next(err); }
  },
  async changeTheme(req, res, next) {
    try {
      const body = schemas.changeTheme.parse(req.body);
      const data = await svc.changeTheme(req.user.id, body.theme);
      return ok(res, data);
    } catch (err) { next(err); }
  },
  async changePassword(req, res, next) {
    try {
      const body = schemas.changePassword.parse(req.body);
      const data = await svc.changePassword(req.user.id, body);
      return ok(res, data);
    } catch (err) { next(err); }
  },
  async deleteAccount(req, res, next) {
    try {
      const body = schemas.deleteAccount.parse(req.body);
      const data = await svc.deleteAccount(req.user.id, body.confirm_text);
      return ok(res, data);
    } catch (err) { next(err); }
  },
};
