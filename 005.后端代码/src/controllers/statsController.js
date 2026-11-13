const svc = require("../services/statsService");
const { ok } = require("../utils/response");

function range(req) {
  return svc.normalizeRange(req.query.start, req.query.end, req.query.month);
}

// 兼容旧的趋势参数：end_month=YYYY-MM & months=N
function shiftMonthKey(key, n) {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function trendRange(req) {
  const { start, end, end_month, months } = req.query;
  if (!(start && end)) {
    if (/^\d{4}-\d{2}$/.test(end_month || "") || Number(months) > 0) {
      const endKey = /^\d{4}-\d{2}$/.test(end_month || "")
        ? end_month
        : svc.monthRange().start.slice(0, 7);
      const size = Math.max(1, Math.min(60, Number(months) || 6));
      const first = shiftMonthKey(endKey, -(size - 1));
      return { start: `${first}-01`, end: svc.monthRange(endKey).end };
    }
  }
  return range(req);
}

module.exports = {
  async summary(req, res, next) {
    try {
      const { start, end } = range(req);
      const data = await svc.summary(req.user.id, start, end);
      return ok(res, data);
    } catch (err) { next(err); }
  },
  async breakdown(req, res, next) {
    try {
      const { start, end } = range(req);
      const data = await svc.breakdown(req.user.id, start, end, req.query.type || "expense");
      return ok(res, data);
    } catch (err) { next(err); }
  },
  async trend(req, res, next) {
    try {
      const { start, end } = trendRange(req);
      const data = await svc.trend(req.user.id, start, end);
      return ok(res, data);
    } catch (err) { next(err); }
  },
  async comparison(req, res, next) {
    try {
      const { start, end } = range(req);
      const data = await svc.comparison(req.user.id, start, end);
      return ok(res, data);
    } catch (err) { next(err); }
  },
};
