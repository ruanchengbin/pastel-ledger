const pool = require("../db/pool");
const { AppError, ERR } = require("../utils/error");
const { yuanToCents, centsToYuan } = require("../utils/centYuan");

async function getConfig(userId) {
  const [[b]] = await pool.query(
    "SELECT * FROM budgets WHERE user_id = ?",
    [userId]
  );
  const [cats] = await pool.query(
    `SELECT cb.*, c.name AS category_name, c.type AS category_type, c.is_system AS is_system
     FROM category_budgets cb JOIN categories c ON cb.category_id = c.id
     WHERE cb.user_id = ? ORDER BY cb.created_at ASC`,
    [userId]
  );
  return {
    period_start_day: b?.period_start_day ?? 1,
    total_amount_yuan: b?.total_amount_cents ? centsToYuan(b.total_amount_cents) : null,
    category_budgets: cats.map((c) => ({
      category_id: c.category_id,
      category_name: c.category_name,
      amount_yuan: centsToYuan(c.amount_cents),
    })),
  };
}

async function saveConfig(userId, payload) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const totalCents = payload.total_amount_yuan == null
      ? null
      : yuanToCents(payload.total_amount_yuan);

    await conn.query(
      `INSERT INTO budgets (user_id, period_start_day, total_amount_cents)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         period_start_day = VALUES(period_start_day),
         total_amount_cents = VALUES(total_amount_cents),
         updated_at = NOW()`,
      [userId, payload.period_start_day, totalCents]
    );

    // 全清分类预算 + 重建
    await conn.query("DELETE FROM category_budgets WHERE user_id = ?", [userId]);

    for (const cb of payload.category_budgets || []) {
      // 校验分类属于当前用户 + 是支出分类 + 存在
      const [cat] = await conn.query(
        "SELECT id FROM categories WHERE id = ? AND user_id = ? AND type = 'expense' AND deleted_at IS NULL LIMIT 1",
        [cb.category_id, userId]
      );
      if (!cat.length) {
        throw new AppError(ERR.CATEGORY_TYPE_MISMATCH, 422, `分类预算指向不存在或非支出的分类（id=${cb.category_id}）`);
      }
      await conn.query(
        "INSERT INTO category_budgets (user_id, category_id, amount_cents) VALUES (?, ?, ?)",
        [userId, cb.category_id, yuanToCents(cb.amount_yuan)]
      );
    }

    await conn.commit();
    return getConfig(userId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function getProgress(userId, reference) {
  const refDate = reference ? new Date(reference) : new Date();
  const refKey = refDate.toISOString().slice(0, 10);

  // 取 period_start_day 与总预算
  const [[b]] = await pool.query("SELECT period_start_day, total_amount_cents FROM budgets WHERE user_id = ?", [userId]);
  const startDay = b?.period_start_day || 1;

  // 计算周期起止
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  let periodStart, periodEnd;
  if (refDate.getDate() >= startDay) {
    periodStart = `${year}-${String(month + 1).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
  } else {
    const y = month === 0 ? year - 1 : year;
    const m = month === 0 ? 12 : month;
    periodStart = `${y}-${String(m).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
  }
  const pStart = new Date(periodStart + "T00:00:00Z");
  const pEnd = new Date(pStart.getTime() + 31 * 86_400_000); // 先估一个月后
  // 周期结束（exclusive）= 下一个周期的起始日，即 pEnd 所在月的 startDay
  const pEndY = pEnd.getUTCFullYear();
  const pEndM = pEnd.getUTCMonth() + 1;
  periodEnd = `${pEndY}-${String(pEndM).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;

  // 总预算已用
  const [[usage]] = await pool.query(
    `SELECT COALESCE(SUM(amount_cents),0) AS used_cents, COUNT(*) AS tx_count
     FROM transactions
     WHERE user_id = ? AND type = 'expense' AND deleted_at IS NULL
       AND occurred_on >= ? AND occurred_on < ?`,
    [userId, periodStart, periodEnd]
  );
  const total = b?.total_amount_cents || 0;
  const used = Number(usage.used_cents);
  const remaining = total - used;
  const rate = total > 0 ? Math.round((used / total) * 100) : 0;

  // 分类预算明细
  const [cats] = await pool.query(
    `SELECT cb.category_id, cb.amount_cents, c.name AS category_name
     FROM category_budgets cb JOIN categories c ON c.id = cb.category_id
     WHERE cb.user_id = ?`,
    [userId]
  );
  const catBreakdown = [];
  for (const cb of cats) {
    const [[u]] = await pool.query(
      `SELECT COALESCE(SUM(amount_cents),0) AS used_cents
       FROM transactions
       WHERE user_id = ? AND category_id = ? AND type = 'expense' AND deleted_at IS NULL
         AND occurred_on >= ? AND occurred_on < ?`,
      [userId, cb.category_id, periodStart, periodEnd]
    );
    const catUsed = Number(u.used_cents);
    const catRate = cb.amount_cents > 0 ? Math.round((catUsed / cb.amount_cents) * 100) : 0;
    catBreakdown.push({
      category_id: cb.category_id,
      category_name: cb.category_name,
      budget_yuan: centsToYuan(cb.amount_cents),
      used_yuan: centsToYuan(catUsed),
      rate: catRate,
    });
  }

  return {
    period: { start: periodStart, end: periodEnd, start_day: startDay },
    total_yuan: centsToYuan(total),
    used_yuan: centsToYuan(used),
    remaining_yuan: centsToYuan(remaining),
    consumption_rate: rate,
    period_tx_count: Number(usage.tx_count),
    category_breakdown: catBreakdown,
    threshold_alerts: [],
  };
}

module.exports = { getConfig, saveConfig, getProgress };
