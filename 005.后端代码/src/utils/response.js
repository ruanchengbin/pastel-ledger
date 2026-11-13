/**
 * 统一 API 响应格式：{ code, data, message }
 * code: 0 = 成功；非 0 = 业务错误码（见 utils/error.js）
 */

function ok(res, data = null, message = "ok") {
  return res.status(200).json({ code: 0, data, message });
}

function created(res, data = null, message = "created") {
  return res.status(201).json({ code: 0, data, message });
}

module.exports = { ok, created };
