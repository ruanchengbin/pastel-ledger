const pool = require("../db/pool");
const { centsToYuan } = require("../utils/centYuan");

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toUTC(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`);
}

function formatUTC(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

// 在日期字符串上加/减若干天，返回 YYYY-MM-DD
function addDays(dateStr, n) {
  const d = toUTC(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return formatUTC(d);
}

// 两个日期之间的天数（含首尾）
function daysBetween(start, end) {
  return Math.round((toUTC(end) - toUTC(start)) / DAY_MS) + 1;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 自然月的起止日（含）
function monthRange(month) {
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : todayStr().slice(0, 7);
  const [y, mm] = m.split("-").map(Number);
  const nextKey = mm === 12 ? `${y + 1}-01` : `${y}-${pad2(mm + 1)}`;
  return { start: `${m}-01`, end: addDays(`${nextKey}-01`, -1) };
}

// 规整查询范围：优先使用 start/end，否则回退到 month
function normalizeRange(start, end, month) {
  if (DATE_RE.test(start) && DATE_RE.test(end) && start <= end) {
    return { start, end };
  }
  return monthRange(month);
}

async function querySummary(userId, start, end) {
  const endExclusive = addDays(end, 1);
  const [[s]] = await pool.query(
    `SELECT
        ROUND(SUM(CASE WHEN type='expense' THEN amount_cents ELSE 0 END)/100,2) AS expense_yuan,
        ROUND(SUM(CASE WHEN type='income' THEN amount_cents ELSE 0 END)/100,2)  AS income_yuan,
        COUNT(*) AS n
     FROM transactions WHERE user_id = ? AND deleted_at IS NULL
       AND occurred_on >= ? AND occurred_on < ?`,
    [userId, start, endExclusive]
  );
  const expense = Number(s.expense_yuan) || 0;
  const income = Number(s.income_yuan) || 0;
  const balance = Number((income - expense).toFixed(2));
  const days = daysBetween(start, end);
  const today = todayStr();
  // 日均支出按“已过天数”计算：区间未完只算到今天，未开始按 1 天，已结束算满区间
  const passed = today >= start && today <= end ? daysBetween(start, today) : today < start ? 1 : days;
  const balanceRate = income > 0 ? Number(((balance / income) * 100).toFixed(1)) : null;

  return {
    start,
    end,
    days,
    expense_yuan: expense,
    income_yuan: income,
    balance_yuan: balance,
    balance_rate: balanceRate,
    transaction_count: Number(s.n) || 0,
    avg_daily_expense: Number((expense / passed).toFixed(2)),
  };
}

async function summary(userId, start, end) {
  return querySummary(userId, start, end);
}

async function breakdown(userId, start, end, type) {
  const endExclusive = addDays(end, 1);
  const [rows] = await pool.query(
    `SELECT t.category_id, SUM(t.amount_cents) AS cents,
            c.name AS category_name, c.icon AS category_icon, c.color AS category_color
     FROM transactions t JOIN categories c ON t.category_id = c.id
     WHERE t.user_id = ? AND t.deleted_at IS NULL
       AND t.type = ? AND t.occurred_on >= ? AND t.occurred_on < ?
     GROUP BY t.category_id, c.name, c.icon, c.color
     ORDER BY cents DESC`,
    [userId, type, start, endExclusive]
  );
  const total = rows.reduce((a, r) => a + Number(r.cents), 0);
  const topN = 8;
  let result = rows.map((r) => ({
    category_id: r.category_id,
    name: r.category_name,
    icon: r.category_icon,
    color: r.category_color,
    amount_yuan: centsToYuan(r.cents),
    percent: total > 0 ? Number(((r.cents / total) * 100).toFixed(1)) : 0,
  }));

  if (result.length > topN) {
    const head = result.slice(0, topN);
    const rest = result.slice(topN);
    const merged = {
      category_id: null,
      name: "其他",
      icon: "category",
      color: "#8A849D",
      amount_yuan: Number(rest.reduce((a, b) => a + b.amount_yuan, 0).toFixed(2)),
      percent: Number(rest.reduce((a, b) => a + b.percent, 0).toFixed(1)),
    };
    result = [...head, merged];
  }
  return result;
}

// 按自然月分组，覆盖 start..end 所跨的所有月份
async function trend(userId, start, end) {
  const endExclusive = addDays(end, 1);
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(occurred_on, '%Y-%m') AS m,
            ROUND(SUM(CASE WHEN type='expense' THEN amount_cents ELSE 0 END)/100,2) AS expense_yuan,
            ROUND(SUM(CASE WHEN type='income'  THEN amount_cents ELSE 0 END)/100,2) AS income_yuan
     FROM transactions WHERE user_id = ? AND deleted_at IS NULL
       AND occurred_on >= ? AND occurred_on < ?
     GROUP BY 1 ORDER BY 1 ASC`,
    [userId, start, endExclusive]
  );

  const map = new Map(
    rows.map((r) => [
      r.m,
      { month: r.m, expense_yuan: Number(r.expense_yuan) || 0, income_yuan: Number(r.income_yuan) || 0 },
    ])
  );

  // 从起始月到结束月逐月补零
  const result = [];
  let cur = start.slice(0, 7);
  const last = end.slice(0, 7);
  while (cur <= last) {
    result.push(map.get(cur) || { month: cur, expense_yuan: 0, income_yuan: 0 });
    const [y, m] = cur.split("-").map(Number);
    cur = m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`;
  }
  return result;
}

// 推断对比区间：整月对比上月、整年对比上年，其余按等长前置区间
function inferPreviousRange(start, end) {
  const startOfMonth = start.slice(0, 7) + "-01";
  const endOfMonth = addDays(monthEndNext(start.slice(0, 7)), -1);
  const isFullMonth = start === startOfMonth && end === endOfMonth;

  if (start.endsWith("-01-01") && end.endsWith("-12-31")) {
    const y = Number(start.slice(0, 4)) - 1;
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }

  if (isFullMonth) {
    const [y, m] = start.slice(0, 7).split("-").map(Number);
    const prevKey = m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
    return monthRange(prevKey);
  }

  const days = daysBetween(start, end);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  return { start: prevStart, end: prevEnd };
}

// 返回某月的下个月 1 号
function monthEndNext(key) {
  const [y, m] = key.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad2(m + 1)}-01`;
}

async function comparison(userId, start, end) {
  const prevRange = inferPreviousRange(start, end);
  const cur = await querySummary(userId, start, end);
  const prev = await querySummary(userId, prevRange.start, prevRange.end);

  const pct = (now, before) => {
    if (!before || before === 0) return null;
    return Number((((now - before) / before) * 100).toFixed(1));
  };

  return {
    current: cur,
    previous: prev,
    expense_percent: pct(cur.expense_yuan, prev.expense_yuan),
    income_percent: pct(cur.income_yuan, prev.income_yuan),
    balance_diff: Number((cur.balance_yuan - prev.balance_yuan).toFixed(2)),
  };
}

module.exports = { summary, breakdown, trend, comparison, normalizeRange, monthRange };
