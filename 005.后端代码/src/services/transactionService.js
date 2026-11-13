const pool = require("../db/pool");
const { yuanToCents, centsToYuan } = require("../utils/centYuan");
const { AppError, ERR } = require("../utils/error");
const linkSvc = require("./linkService");

// 读取/校验分类是否属于该用户且类型匹配
async function checkCategoryOwnershipAndType(conn, userId, categoryId, expectedType) {
  const [rows] = await conn.query(
    `SELECT id, type, is_system, status FROM categories
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [categoryId, userId]
  );
  if (!rows.length) return null;
  const cat = rows[0];
  if (cat.status !== "active") return null;
  if (expectedType && cat.type !== expectedType) return null;
  return cat;
}

async function createOne(userId, payload) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 分类校验（应用层保证 MySQL 跨三表 FK 无法覆盖的逻辑）
    const cat = await checkCategoryOwnershipAndType(conn, userId, payload.category_id, payload.type);
    if (!cat) {
      throw new AppError(ERR.CATEGORY_TYPE_MISMATCH, 422, "分类不存在或类型不匹配");
    }

    const amountCents = yuanToCents(payload.amount);
    const id = payload.id || null;
    const [result] = await conn.query(
      `INSERT INTO transactions
         (id, user_id, category_id, type, amount_cents, occurred_on, note, client_id)
       VALUES (COALESCE(?, UUID()), ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, payload.category_id, payload.type, amountCents, payload.occurred_on, payload.note || null, payload.client_id || null]
    );

    const idBack = id || null;
    let queryId = idBack;
    if (!queryId) {
      const [candidate] = await conn.query(
        `SELECT id FROM transactions WHERE user_id = ? AND occurred_on = ? AND amount_cents = ?
          AND type = ? AND note <=> ? AND created_at >= NOW() - INTERVAL 5 SECOND
         ORDER BY created_at DESC LIMIT 1`,
        [userId, payload.occurred_on, amountCents, payload.type, payload.note || null]
      );
      queryId = candidate[0]?.id;
    }
    const [rows] = await conn.query(
      "SELECT id, version, server_updated_at FROM transactions WHERE id = ?",
      [queryId]
    );

    await conn.commit();
    return { id: idBack, version: rows[0].version, server_updated_at: rows[0].server_updated_at };
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_NO_REFERENCED_ROW_2") {
      throw new AppError(ERR.CATEGORY_TYPE_MISMATCH, 422, "分类不存在或类型不匹配");
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function batchCreate(userId, items) {
  const conn = await pool.getConnection();
  let inserted = 0, skipped = 0;
  try {
    await conn.beginTransaction();
    for (const item of items) {
      const amountCents = yuanToCents(item.amount);
      const id = item.id;
      if (id) {
        const [exist] = await conn.query(
          "SELECT id FROM transactions WHERE id = ? AND user_id = ? LIMIT 1",
          [id, userId]
        );
        if (exist.length) { skipped++; continue; }
      }

      await conn.query(
        `INSERT INTO transactions
           (id, user_id, category_id, type, amount_cents, occurred_on, note, client_id)
         VALUES (COALESCE(?, UUID()), ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = VALUES(id)`,
        [id, userId, item.category_id, item.type, amountCents, item.occurred_on, item.note || null, item.client_id || null]
      );
      inserted++;
    }
    await conn.commit();
    return { inserted, skipped };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally { conn.release(); }
}

// 构造可见账户列表：自动附加本人 + 已关联账户，并校验 accessor 有权限看 accountIds 里的每一个
async function resolveAccountScope(accessorId, accountIds) {
  const all = await linkSvc.resolveVisibleAccounts(accessorId);
  const allIds = new Set(all.map(function (a) { return a.id; }));
  const me = accessorId;

  if (!accountIds || !accountIds.length) {
    // 不传 account_ids — 默认只看自己（保持旧行为）
    return { ids: [me], all: all };
  }

  // 验证每个 accountId 都在可见范围内
  const filtered = [];
  for (const id of accountIds) {
    if (!allIds.has(id)) {
      throw new AppError(ERR.FORBIDDEN, 403, "无权查看该账户的流水");
    }
    filtered.push(id);
  }
  if (!filtered.length) filtered.push(me);
  return { ids: filtered, all: all };
}

async function listByMonth(accessorId, { month, type, category_ids, keyword, min_amount, max_amount, cursor, limit, account_ids }) {
  limit = Math.min(Math.max(limit || 20, 1), 100);
  const m = month || new Date().toISOString().slice(0, 7);
  const startDate = `${m}-01`;
  const nextMonth = new Date(Date.parse(startDate) + 32 * 86_400_000);
  const endDate = nextMonth.toISOString().slice(0, 7) + "-01";

  // account_ids 过滤：本人默认可看 + 已关联账户才允许看
  const scope = await resolveAccountScope(accessorId, account_ids);
  const isMulti = scope.ids.length > 1;
  const isOnlyMe = scope.ids.length === 1 && scope.ids[0] === accessorId;

  const where = [
    "t.deleted_at IS NULL",
    "t.occurred_on >= ?",
    "t.occurred_on < ?",
  ];
  const params = [startDate, endDate];

  if (scope.ids.length === 1) {
    where.push("t.user_id = ?");
    params.push(scope.ids[0]);
  } else {
    where.push(`t.user_id IN (${scope.ids.map(() => "?").join(",")})`);
    params.push(...scope.ids);
  }

  if (type) { where.push("t.type = ?"); params.push(type); }
  if (category_ids && category_ids.length) {
    where.push(`t.category_id IN (${category_ids.map(() => "?").join(",")})`);
    params.push(...category_ids);
  }
  if (keyword) { where.push("t.note LIKE ?"); params.push(`%${keyword}%`); }
  if (min_amount != null) {
    where.push("t.amount_cents >= ?");
    params.push(yuanToCents(min_amount));
  }
  if (max_amount != null) {
    where.push("t.amount_cents <= ?");
    params.push(yuanToCents(max_amount));
  }
  if (cursor) {
    where.push("t.updated_at < ?");
    params.push(new Date(cursor));
  }

  // JOIN users 拿 owner_email；JOIN categories 取分类兜底字段（跨账户分类 ID 不同）
  const ownerJoin = isMulti
    ? ` LEFT JOIN users u ON u.id = t.user_id`
    : "";

  const sql = `
    SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
    ${isMulti ? ", LOWER(u.email) AS owner_email" : ""}
    FROM transactions t JOIN categories c ON t.category_id = c.id
    ${ownerJoin}
    WHERE ${where.join(" AND ")}
    ORDER BY t.occurred_on DESC, t.created_at DESC
    LIMIT ?
  `;
  params.push(limit + 1);
  const [rows] = await pool.query(sql, params);

  const hasMore = rows.length > limit;
  const list = rows.slice(0, limit).map(function (row) {
    var t = transform(row);
    if (isMulti) {
      t.owner_email = row.owner_email || null;
      t.readonly = row.user_id !== accessorId;
    }
    return t;
  });
  const nextCursor = hasMore ? rows[rows.length - 2].updated_at.toISOString() : null;

  // 月度汇总：只有"仅本人"模式下返回
  let monthSummary = null;
  if (isOnlyMe) {
    const [summaryRows] = await pool.query(
      `SELECT
          SUM(CASE WHEN type='expense' THEN 1 ELSE 0 END) AS expense_count,
          ROUND(SUM(CASE WHEN type='expense' THEN amount_cents ELSE 0 END)/100,2) AS expense_yuan,
          SUM(CASE WHEN type='income' THEN 1 ELSE 0 END) AS income_count,
          ROUND(SUM(CASE WHEN type='income' THEN amount_cents ELSE 0 END)/100,2) AS income_yuan
       FROM transactions
       WHERE user_id = ? AND deleted_at IS NULL AND occurred_on >= ? AND occurred_on < ?`,
      [accessorId, startDate, endDate]
    );
    const s = summaryRows[0];
    monthSummary = {
      expense_count: Number(s.expense_count) || 0,
      expense_yuan: Number(s.expense_yuan) || 0,
      income_count: Number(s.income_count) || 0,
      income_yuan: Number(s.income_yuan) || 0,
    };
  } else {
    // 多账户模式下返回跨账户合计
    const inClause = scope.ids.length === 1
      ? "user_id = ?"
      : "user_id IN (" + scope.ids.map(() => "?").join(",") + ")";
    const [summaryRows] = await pool.query(
      `SELECT
          SUM(CASE WHEN type='expense' THEN 1 ELSE 0 END) AS expense_count,
          ROUND(SUM(CASE WHEN type='expense' THEN amount_cents ELSE 0 END)/100,2) AS expense_yuan,
          SUM(CASE WHEN type='income' THEN 1 ELSE 0 END) AS income_count,
          ROUND(SUM(CASE WHEN type='income' THEN amount_cents ELSE 0 END)/100,2) AS income_yuan
       FROM transactions
       WHERE ${inClause} AND deleted_at IS NULL AND occurred_on >= ? AND occurred_on < ?`,
      [...scope.ids, startDate, endDate]
    );
    const s = summaryRows[0];
    monthSummary = {
      expense_count: Number(s.expense_count) || 0,
      expense_yuan: Number(s.expense_yuan) || 0,
      income_count: Number(s.income_count) || 0,
      income_yuan: Number(s.income_yuan) || 0,
    };
  }

  return {
    items: list,
    cursor: nextCursor,
    has_more: hasMore,
    month_summary: monthSummary,
    visible_accounts: scope.all,
  };
}

async function findOne(userId, id) {
  const [rows] = await pool.query(
    `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
            LOWER(u.email) AS owner_email
     FROM transactions t JOIN categories c ON t.category_id = c.id
     JOIN users u ON u.id = t.user_id
     WHERE t.id = ? AND t.deleted_at IS NULL LIMIT 1`,
    [id]
  );
  if (!rows.length) throw new AppError(ERR.TX_NOT_FOUND, 404, "流水不存在或已删除");
  const t = rows[0];

  // 权限：自己 OR 已关联对方
  if (t.user_id !== userId) {
    const [ok] = await pool.query(
      `SELECT 1 FROM account_links
       WHERE status = 'accepted'
         AND ((requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?))
       LIMIT 1`,
      [userId, t.user_id, t.user_id, userId]
    );
    if (!ok.length) throw new AppError(ERR.TX_NOT_FOUND, 404, "流水不存在或已删除");
  }

  var out = transform(t);
  out.owner_email = t.owner_email;
  out.readonly = t.user_id !== userId;
  return out;
}

async function updateOne(userId, id, patch, ifMatchVersion) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.query(
      "SELECT version, type, category_id, user_id FROM transactions WHERE id = ? AND user_id = ? AND deleted_at IS NULL FOR UPDATE",
      [id, userId]
    );
    if (!existing.length) throw new AppError(ERR.TX_NOT_FOUND, 404, "流水不存在或已删除");

    const cur = existing[0];
    if (ifMatchVersion != null && Number(cur.version) !== Number(ifMatchVersion)) {
      throw new AppError(ERR.VERSION_CONFLICT, 409, `该记录已被修改（当前 version=${cur.version}）`);
    }

    const newType = patch.type || cur.type;
    const newCatId = patch.category_id || cur.category_id;
    if (patch.category_id || patch.type) {
      const cat = await checkCategoryOwnershipAndType(conn, userId, newCatId, newType);
      if (!cat) throw new AppError(ERR.CATEGORY_TYPE_MISMATCH, 422, "分类不存在或类型不匹配");
    }

    const fields = [];
    const params = [];
    if (patch.amount != null) { fields.push("amount_cents = ?"); params.push(yuanToCents(patch.amount)); }
    if (patch.type) { fields.push("type = ?"); params.push(patch.type); }
    if (patch.category_id) { fields.push("category_id = ?"); params.push(patch.category_id); }
    if (patch.occurred_on) { fields.push("occurred_on = ?"); params.push(patch.occurred_on); }
    if (patch.note !== undefined) { fields.push("note = ?"); params.push(patch.note || null); }

    if (!fields.length) { await conn.commit(); return { id, version: cur.version }; }

    fields.push("version = version + 1", "updated_at = NOW()", "server_updated_at = NOW()");
    params.push(id, userId);

    await conn.query(
      `UPDATE transactions SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
      params
    );
    const [updated] = await conn.query(
      "SELECT version, server_updated_at FROM transactions WHERE id = ?",
      [id]
    );
    await conn.commit();
    return { id, version: updated[0].version, server_updated_at: updated[0].server_updated_at };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally { conn.release(); }
}

async function softDelete(userId, id) {
  const [result] = await pool.query(
    `UPDATE transactions
       SET deleted_at = NOW(), updated_at = NOW(), server_updated_at = NOW()
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [id, userId]
  );
  if (!result.affectedRows) throw new AppError(ERR.TX_NOT_FOUND, 404, "流水不存在或已删除");
  return {
    deleted_at: new Date().toISOString(),
    undo_expires_at: new Date(Date.now() + 5_000).toISOString(),
  };
}

async function restore(userId, id) {
  const [result] = await pool.query(
    `UPDATE transactions
       SET deleted_at = NULL, updated_at = NOW(), server_updated_at = NOW()
     WHERE id = ? AND user_id = ?`,
    [id, userId]
  );
  if (!result.affectedRows) throw new AppError(ERR.TX_NOT_FOUND, 404, "流水不存在");
  return { ok: true };
}

function transform(row) {
  return {
    id: row.id,
    type: row.type,
    amount: centsToYuan(row.amount_cents),
    category_id: row.category_id,
    category_name: row.category_name,
    category_icon: row.category_icon,
    category_color: row.category_color,
    occurred_on: row.occurred_on instanceof Date ? row.occurred_on.toISOString().slice(0, 10) : row.occurred_on,
    note: row.note || null,
    version: row.version,
    server_updated_at: row.server_updated_at ? row.server_updated_at.toISOString() : null,
    created_at: row.created_at ? row.created_at.toISOString() : null,
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
  };
}

module.exports = {
  createOne, batchCreate, listByMonth, findOne, updateOne, softDelete, restore,
};
