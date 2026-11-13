const { AppError, ERR } = require("../utils/error");

/**
 * 全局错误处理中间件（必须放最后）
 */
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, _next) {
  // AppError
  if (err instanceof AppError) {
    return res.status(err.httpStatus).json({ code: err.code, data: null, message: err.message });
  }

  // Zod 校验失败
  if (err && err.name === "ZodError" && err.issues) {
    const msg = err.issues
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ");
    return res.status(400).json({ code: ERR.VALIDATION, data: null, message: msg });
  }

  // 数据库外键冲突
  if (err && err.code === "ER_NO_REFERENCED_ROW_2") {
    return res
      .status(422)
      .json({ code: ERR.CATEGORY_TYPE_MISMATCH, data: null, message: "分类不存在或类型不匹配" });
  }

  // 兜底
  console.error(`[error] ${req.method} ${req.originalUrl}`);
  console.error(err);
  return res.status(500).json({ code: ERR.INTERNAL, data: null, message: "服务器内部错误" });
};
