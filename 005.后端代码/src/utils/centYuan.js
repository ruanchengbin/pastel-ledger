/**
 * 金额单位转换：数据库存分（BIGINT UNSIGNED），API 用元（浮点）
 * 一律取整避免浮点副作用。
 */

function yuanToCents(yuan) {
  if (yuan == null || Number.isNaN(Number(yuan))) return 0;
  return Math.round(Number(yuan) * 100);
}

function centsToYuan(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return 0;
  return Number((Number(cents) / 100).toFixed(2));
}

module.exports = { yuanToCents, centsToYuan };
