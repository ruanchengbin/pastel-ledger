class AppError extends Error {
  /**
   * @param {number} code     业务错误码
   * @param {number} httpStatus HTTP 状态码
   * @param {string} message   前端展示的错误信息
   */
  constructor(code, httpStatus, message) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.name = "AppError";
  }
}

// ===== 业务错误码常量 =====
const ERR = {
  OK: 0,
  // 参数校验 400xx
  VALIDATION: 40001,
  MALFORMED: 40002,
  // 鉴权 401xx
  TOKEN_EXPIRED: 40101,
  TOKEN_INVALID: 40102,
  ACCOUNT_LOCKED: 40103,
  SESSION_REVOKED: 40104,
  // 禁止 403xx
  FORBIDDEN: 40301,
  NOT_OWNER: 40302,
  // 不存在 404xx
  TX_NOT_FOUND: 40401,
  CAT_NOT_FOUND: 40402,
  USER_NOT_FOUND: 40403,
  SESSION_NOT_FOUND: 40404,
  // 冲突 409xx
  VERSION_CONFLICT: 40901,
  CAT_HAS_TX: 40902,
  EMAIL_EXISTS: 40903,
  // 撤销期过 410xx
  UNDO_EXPIRED: 41001,
  // 业务校验 422xx
  PASSWORD_WEAK: 42201,
  AMOUNT_OOR: 42202,
  DATE_INVALID: 42203,
  CODE_INVALID: 42204,
  CAT_NAME_DUP: 42205,
  CAT_LIMIT: 42206,
  IMPORT_BAD: 42207,
  CATEGORY_TYPE_MISMATCH: 42208,
  // 关联账户 42210 / 40910
  LINK_TARGET_NOT_FOUND: 42210,
  LINK_ALREADY_PENDING: 40910,
  LINK_NOT_FOUND: 40410,
  LINK_INVALID_STATE: 40911,
  // 限流 429xx
  RATE_CODE: 42901,
  RATE_GEN: 42902,
  // 邮件 502xx
  MAIL_SEND_FAILED: 50201,
  // 内部
  INTERNAL: 50000,
};

module.exports = { AppError, ERR };
