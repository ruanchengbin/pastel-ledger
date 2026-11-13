const schemas = require("../validators/schemas");
const authService = require("../services/authService");
const { ok, created } = require("../utils/response");

module.exports = {
  async sendCode(req, res, next) {
    try {
      const body = schemas.sendCode.parse(req.body);
      const r = await authService.createCode(body);

      if (r.delivered) {
        return ok(res, { delivered: true }, "验证码已发送至邮箱");
      }
      // 未配置 SMTP：开发模式降级为控制台输出
      console.warn(
        `[auth] SMTP 未配置，验证码（开发模式）：${r.code} → ${body.email} / ${body.purpose}`
      );
      return ok(res, { delivered: false }, "验证码已生成（开发模式未发信，请查看服务端控制台）");
    } catch (err) { next(err); }
  },

  async register(req, res, next) {
    try {
      const body = schemas.register.parse(req.body);
      const data = await authService.register(body);
      return created(res, data);
    } catch (err) { next(err); }
  },

  async login(req, res, next) {
    try {
      const body = schemas.login.parse(req.body);
      const ip = req.ip || req.socket?.remoteAddress;
      const ua = req.headers["user-agent"];
      const data = await authService.login({ ...body, ip, userAgent: ua });
      return ok(res, data);
    } catch (err) { next(err); }
  },

  async refresh(req, res, next) {
    try {
      const body = schemas.refresh.parse(req.body);
      const data = await authService.refreshAccessToken(body.refresh_token);
      return ok(res, data);
    } catch (err) { next(err); }
  },

  async logout(req, res, next) {
    try {
      const body = schemas.logout.parse(req.body || {});
      const h = req.headers["authorization"] || "";
      const refreshToken = req.body?.refresh_token || null;
      const data = await authService.logout(req.user.id, refreshToken, body.all);
      return ok(res, null);
    } catch (err) { next(err); }
  },

  async resetPassword(req, res, next) {
    try {
      const body = schemas.resetPassword.parse(req.body);
      await authService.resetPassword(body);
      return ok(res, null);
    } catch (err) { next(err); }
  },
};
