const rateLimit = require("express-rate-limit");

function makeLimiter(windowMs, max, keyMsg) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ code: 42902, data: null, message: keyMsg || "请求过于频繁，请稍后再试" });
    },
  });
}

module.exports = {
  // 发送验证码：按 IP，60 秒内最多 3 次（兼容注册/重置密码场景切换）
  sendCodeLimiter: makeLimiter(60_000, 3, "60 秒内发送次数过多，请稍后再试"),
  // 重置密码：独立计数，防止暴力猜验证码
  resetPasswordLimiter: makeLimiter(60_000, 10, "重置密码请求过于频繁，请稍后再试"),
  // 登录：按 IP
  loginLimiter: makeLimiter(60_000, 20, "登录请求过于频繁"),
  // 通用 API
  apiLimiter: makeLimiter(60_000, 120, "操作过于频繁"),
};
