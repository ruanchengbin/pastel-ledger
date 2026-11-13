const pool = require("../db/pool");
const { AppError, ERR } = require("../utils/error");
const { yuanToCents } = require("../utils/centYuan");

// ------ controller ------
module.exports = {
  async exportJSON(userId) {
    const [[user]] = await pool.query("SELECT email FROM users WHERE id = ?", [userId]);
    const [txs] = await pool.query(
      "SELECT * FROM transactions WHERE user_id = ? AND deleted_at IS NULL ORDER BY occurred_on DESC, created_at DESC",
      [userId]
    );
    const [cats] = await pool.query(
      "SELECT * FROM categories WHERE user_id = ? AND deleted_at IS NULL ORDER BY type, sort_order ASC",
      [userId]
    );
    const [[b]] = await pool.query("SELECT * FROM budgets WHERE user_id = ?", [userId]);
    const [cbs] = await pool.query("SELECT * FROM category_budgets WHERE user_id = ?", [userId]);

    return {
      app: "pastel-ledger",
      version: 1,
      exported_at: new Date().toISOString(),
      account: { email: user.email },
      categories: cats.map((c) => ({
        id: c.id, type: c.type, name: c.name, icon: c.icon, color: c.color,
        is_system: !!c.is_system, status: c.status, sort_order: c.sort_order,
      })),
      transactions: txs.map((t) => ({
        id: t.id, type: t.type, category_id: t.category_id,
        amount: (t.amount_cents / 100).toFixed(2),
        occurred_on: dateOnly(t.occurred_on),
        note: t.note, version: t.version,
        created_at: t.created_at?.toISOString(),
        updated_at: t.updated_at?.toISOString(),
      })),
      budgets: b
        ? { period_start_day: b.period_start_day, total_amount_yuan: b.total_amount_cents ? (b.total_amount_cents / 100).toFixed(2) : null }
        : null,
      category_budgets: cbs.map((c) => ({
        category_id: c.category_id, amount_yuan: (c.amount_cents / 100).toFixed(2),
      })),
    };
  },

  async exportCSV(userId) {
    const [txs] = await pool.query(
      `SELECT t.*, c.name AS category_name FROM transactions t JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.deleted_at IS NULL
       ORDER BY t.occurred_on ASC, t.created_at ASC`,
      [userId]
    );
    const rows = [["日期", "类型", "分类", "金额(元)", "备注", "状态"]];
    rows.push(["2026-11-11", "支出", "餐饮", "25.00", "测试", "已同步"]); // 保证最少一行，空库时模板不空
    txs.forEach((t) => {
      rows.push([
        dateOnly(t.occurred_on),
        t.type === "income" ? "收入" : "支出",
        t.category_name,
        (t.amount_cents / 100).toFixed(2),
        t.note || "",
        "已同步",
      ]);
    });
    const csv = "\ufeff" + rows
      .map((r) => r.map((v) => csvCell(String(v))).join(","))
      .join("\r\n");
    return csv;
  },

  async restore(userId, payload) {
    if (payload.confirm_text !== "覆盖") {
      throw new AppError(ERR.IMPORT_BAD, 422, "确认文本必须为'覆盖'");
    }
    const conn = await pool.getConnection();
    let restoredTx = 0, restoredCat = 0;
    try {
      await conn.beginTransaction();
      await conn.query("SET FOREIGN_KEY_CHECKS = 0");
      await conn.query("DELETE FROM category_budgets WHERE user_id = ?", [userId]);
      await conn.query("DELETE FROM transactions WHERE user_id = ?", [userId]);
      await conn.query("DELETE FROM categories WHERE user_id = ?", [userId]);
      await conn.query("DELETE FROM budgets WHERE user_id = ?", [userId]);
      await conn.query("SET FOREIGN_KEY_CHECKS = 1");

      for (const c of payload.categories || []) {
        await conn.query(
          `INSERT INTO categories (id, user_id, type, name, icon, color, is_system, status, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, COALESCE(?,0), COALESCE(?, 'active'), COALESCE(?,0))`,
          [c.id, userId, c.type, c.name, c.icon || "category", c.color || "#7A5FE0", c.is_system, c.status, c.sort_order]
        );
        restoredCat++;
      }
      for (const t of payload.transactions || []) {
        const cents = yuanToCents(t.amount);
        await conn.query(
          `INSERT INTO transactions (id, user_id, category_id, type, amount_cents, occurred_on, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [t.id, userId, t.category_id, t.type, cents, t.occurred_on, t.note || null]
        );
        restoredTx++;
      }
      if (payload.budgets) {
        const total = payload.budgets.total_amount_yuan == null ? null : yuanToCents(payload.budgets.total_amount_yuan);
        await conn.query(
          `INSERT INTO budgets (user_id, period_start_day, total_amount_cents) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE period_start_day = VALUES(period_start_day), total_amount_cents = VALUES(total_amount_cents)`,
          [userId, payload.budgets.period_start_day || 1, total]
        );
      }
      for (const cb of payload.category_budgets || []) {
        await conn.query(
          "INSERT INTO category_budgets (user_id, category_id, amount_cents) VALUES (?, ?, ?)",
          [userId, cb.category_id, yuanToCents(cb.amount_yuan)]
        );
      }
      await conn.commit();
      return { restored_transactions: restoredTx, restored_categories: restoredCat };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },
};

function csvCell(value) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// 兼容 DATE 列（dateStrings 配置下为字符串）与 Date 对象，统一输出 YYYY-MM-DD
function dateOnly(value) {
  if (!value) return value;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
