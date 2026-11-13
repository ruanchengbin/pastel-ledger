const { verifyAccess } = require("../utils/jwt");
const { AppError, ERR } = require("../utils/error");

/**
 * Bearer token 鉴权
 * 1. 从 Authorization 头提取 "Bearer <token>"
 * 2. jwt.verify 解出 sub (user_id)
 * 3. 附加 req.user = { id } 并传递
 * 4. Access Token 过期 → 40101（客户端用 refresh-token 换新）
 */
module.exports = function authRequired(req, _res, next) {
  const h = req.headers["authorization"] || req.headers["Authorization"];
  if (!h || !h.startsWith("Bearer ")) {
    return next(new AppError(ERR.TOKEN_INVALID, 401, "请先登录"));
  }
  const token = h.slice(7).trim();
  if (!token) return next(new AppError(ERR.TOKEN_INVALID, 401, "Token 为空"));

  const payload = verifyAccess(token);
  if (!payload) return next(new AppError(ERR.TOKEN_INVALID, 401, "Token 无效或已过期"));

  req.user = { id: payload.sub };
  next();
};
