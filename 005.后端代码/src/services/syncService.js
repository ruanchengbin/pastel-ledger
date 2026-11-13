const pool = require("../db/pool");
const { yuanToCents, centsToYuan } = require("../utils/centYuan");
const { AppError, ERR } = require("../utils/error");
const linkSvc = require("./linkService");

async function pull(userId, sinceIso) {
  const since = new Date(sinceIso);
  const [txs] = await pool.query(
    `SELECT id, type, category_id, amount_cents, occurred_on, note, version, deleted_at, server_updated_at
     FROM transactions
     WHERE user_id = ? AND server_updated_at > ?
     ORDER BY server_updated_at ASC LIMIT 2000`,
    [userId, since]
  );
  const [cats] = await pool.query(
    `SELECT id, type, name, icon, color, is_system, status, sort_order, deleted_at, updated_at
     FROM categories WHERE user_id = ? AND updated_at > ?
     ORDER BY updated_at ASC LIMIT 500`,
    [userId, since]
  );
  const [budgets] = await pool.query(
    `SELECT user_id, period_start_day, total_amount_cents, updated_at FROM budgets WHERE user_id = ? AND updated_at > ?`,
    [userId, since]
  );
  const [cbs] = await pool.query(
    `SELECT id, category_id, amount_cents, updated_at FROM category_budgets WHERE user_id = ? AND updated_at > ? LIMIT 500`,
    [userId, since]
  );

  return {
    server_now: new Date().toISOString(),
    transactions: txs.map(transformTx),
    categories: cats.map(transformCat),
    budgets: budgets.map((b) => ({
      user_id: b.user_id,
      period_start_day: b.period_start_day,
      total_amount_yuan: b.total_amount_cents ? centsToYuan(b.total_amount_cents) : null,
    })),
    category_budgets: cbs.map((c) => ({
      id: c.id,
      category_id: c.category_id,
      amount_yuan: centsToYuan(c.amount_cents),
    })),
  };
}

async function push(userId, { transactions = [], categories = [], budgets = null, category_budgets = [] }) {
  const conn = await pool.getConnection();
  const result = { transactions: [], categories: [], category_budgets: [] };
  try {
    await conn.beginTransaction();

    for (const c of categories) {
      const [exist] = await conn.query("SELECT id FROM categories WHERE id = ? AND user_id = ?", [c.id, userId]);
      if (exist.length) {
        await conn.query(
          `UPDATE categories SET name=?, icon=?, color=?, status=?, sort_order=?
           WHERE id=? AND user_id=?`,
          [c.name, c.icon, c.color, c.status || "active", c.sort_order ?? 99, c.id, userId]
        );
      } else {
        await conn.query(
          `INSERT INTO categories (id, user_id, type, name, icon, color, is_system, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, 0), COALESCE(?, 99))`,
          [c.id, userId, c.type, c.name, c.icon, c.color, c.is_system, c.sort_order]
        );
      }
      result.categories.push({ id: c.id, applied: true });
    }

    for (const t of transactions) {
      const amountCents = yuanToCents(t.amount);
      const [exist] = await conn.query("SELECT id, version FROM transactions WHERE id = ? AND user_id = ?", [t.id, userId]);
      if (exist.length) {
        const [rows] = await conn.query(
          `UPDATE transactions SET type=?, category_id=?, amount_cents=?, occurred_on=?, note=?,
            deleted_at = ?, updated_at = NOW(), server_updated_at = NOW()
           WHERE id=? AND user_id=? AND version = ?`,
          [t.type, t.category_id, amountCents, t.occurred_on, t.note || null,
           t.deleted_at ? new Date(t.deleted_at) : null,
           t.id, userId, exist[0].version]
        );
        result.transactions.push({ id: t.id, server_updated_at: new Date().toISOString(), applied: true, conflict_with: rows.affectedRows === 0 ? exist[0].version : null });
      } else {
        await conn.query(
          `INSERT INTO transactions (id, user_id, category_id, type, amount_cents, occurred_on, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [t.id, userId, t.category_id, t.type, amountCents, t.occurred_on, t.note || null]
        );
        result.transactions.push({ id: t.id, server_updated_at: new Date().toISOString(), applied: true, conflict_with: null });
      }
    }

    if (budgets) {
      const total = budgets.total_amount_yuan == null ? null : yuanToCents(budgets.total_amount_yuan);
      await conn.query(
        `INSERT INTO budgets (user_id, period_start_day, total_amount_cents)
         VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE period_start_day = VALUES(period_start_day), total_amount_cents = VALUES(total_amount_cents)`,
        [userId, budgets.period_start_day || 1, total]
      );
    }

    if (Array.isArray(category_budgets) && category_budgets.length) {
      await conn.query("DELETE FROM category_budgets WHERE user_id = ?", [userId]);
      for (const cb of category_budgets) {
        await conn.query(
          "INSERT INTO category_budgets (user_id, category_id, amount_cents) VALUES (?, ?, ?)",
          [userId, cb.category_id, yuanToCents(cb.amount_yuan)]
        );
      }
      result.category_budgets.push({ count: category_budgets.length });
    }

    await conn.commit();
    result.server_now = new Date().toISOString();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return result;
}

async function full(userId, opts = {}) {
  const includePartners = !!opts.include_partners;

  const [[user]] = await pool.query("SELECT email, display_name FROM users WHERE id = ?", [userId]);
  const [txs] = await pool.query(
    `SELECT t.id, t.type, t.category_id, t.amount_cents, t.occurred_on, t.note,
            t.version, t.deleted_at, t.server_updated_at, t.created_at, t.user_id,
            c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
            LOWER(u.email) AS owner_email, u.display_name AS owner_name
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     JOIN users u ON u.id = t.user_id
     WHERE t.user_id = ? AND t.deleted_at IS NULL
     ORDER BY t.occurred_on DESC, t.created_at DESC`,
    [userId]
  );
  const [cats] = await pool.query(
    "SELECT * FROM categories WHERE user_id = ? AND deleted_at IS NULL ORDER BY type, sort_order ASC",
    [userId]
  );
  const [[b]] = await pool.query("SELECT * FROM budgets WHERE user_id = ?", [userId]);
  const [cbs] = await pool.query(
    "SELECT * FROM category_budgets WHERE user_id = ?",
    [userId]
  );

  let partnerAccounts = [];
  if (includePartners) {
    partnerAccounts = await linkSvc.listAcceptedPartners(userId);
    if (partnerAccounts.length) {
      const [partnerTxs] = await pool.query(
        `SELECT t.id, t.type, t.category_id, t.amount_cents, t.occurred_on, t.note,
                t.version, t.deleted_at, t.server_updated_at, t.created_at, t.user_id,
                c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
                LOWER(u.email) AS owner_email, u.display_name AS owner_name
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
         JOIN users u ON u.id = t.user_id
         WHERE t.deleted_at IS NULL
           AND t.user_id IN (${partnerAccounts.map(() => "?").join(",")})
         ORDER BY t.occurred_on DESC, t.created_at DESC`,
        partnerAccounts.map(function (p) { return p.id; })
      );
      txs.push(...partnerTxs);
    }
  }

  return {
    categories: cats.map(transformCat),
    transactions: txs.map(function (r) {
      var t = transformTx(r);
      if (r.user_id !== userId) {
        t.owner_email = r.owner_email;
        t.owner_name = r.owner_name || null;
        t.category_name = r.category_name;
        t.category_icon = r.category_icon;
        t.category_color = r.category_color;
        t.readonly = true;
      }
      return t;
    }),
    visible_accounts: [
      { id: userId, email: user.email, name: user.display_name || null },
      ...partnerAccounts.map(function (p) { return { id: p.id, email: p.email, name: p.name || null }; }),
    ],
    budgets: b ? { period_start_day: b.period_start_day, total_amount_yuan: b.total_amount_cents ? centsToYuan(b.total_amount_cents) : null } : null,
    category_budgets: cbs.map((c) => ({ category_id: c.category_id, amount_yuan: centsToYuan(c.amount_yuan) })),
  };
}

function transformTx(r) {
  return {
    id: r.id,
    type: r.type,
    category_id: r.category_id,
    amount: centsToYuan(r.amount_cents),
    category_name: r.category_name || null,
    category_icon: r.category_icon || null,
    category_color: r.category_color || null,
    occurred_on:
      typeof r.occurred_on === "string"
        ? r.occurred_on.slice(0, 10)
        : r.occurred_on
          ? r.occurred_on.toISOString().slice(0, 10)
          : r.occurred_on,
    note: r.note,
    version: r.version,
    deleted_at: r.deleted_at?.toISOString() || null,
    server_updated_at: r.server_updated_at?.toISOString(),
    created_at: r.created_at?.toISOString(),
  };
}
function transformCat(r) {
  return {
    id: r.id, type: r.type, name: r.name, icon: r.icon, color: r.color,
    is_system: !!r.is_system, status: r.status, sort_order: r.sort_order,
    deleted_at: r.deleted_at?.toISOString() || null,
  };
}

module.exports = { pull, push, full };
