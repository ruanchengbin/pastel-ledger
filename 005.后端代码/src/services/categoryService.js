const pool = require("../db/pool");
const { AppError, ERR } = require("../utils/error");

async function listAll(userId, type = null) {
  const sql = type
    ? `SELECT * FROM categories WHERE user_id = ? AND type = ? AND deleted_at IS NULL ORDER BY type, sort_order ASC, created_at ASC`
    : `SELECT * FROM categories WHERE user_id = ? AND deleted_at IS NULL ORDER BY type, sort_order ASC, created_at ASC`;
  const [rows] = await pool.query(sql, type ? [userId, type] : [userId]);

  const groups = { expense: [], income: [] };
  for (const r of rows) {
    groups[r.type].push(transform(r));
  }
  if (type) return groups[type] || [];
  return groups;
}

async function createOne(userId, payload) {
  // 重名校验（同类型）
  const [dup] = await pool.query(
    "SELECT id FROM categories WHERE user_id = ? AND type = ? AND name = ? AND deleted_at IS NULL LIMIT 1",
    [userId, payload.type, payload.name]
  );
  if (dup.length) throw new AppError(ERR.CAT_NAME_DUP, 422, "同一类型下已存在同名分类");

  // 上限校验
  const [countRows] = await pool.query(
    "SELECT COUNT(*) AS n FROM categories WHERE user_id = ? AND type = ? AND is_system = 0 AND deleted_at IS NULL",
    [userId, payload.type]
  );
  if (countRows[0].n >= 50) throw new AppError(ERR.CAT_LIMIT, 422, "自定义分类已达上限（50 个）");

  // 取 max(sort_order) + 1
  const [maxOrder] = await pool.query(
    "SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE user_id = ? AND type = ? AND deleted_at IS NULL",
    [userId, payload.type]
  );
  const nextOrder = Number(maxOrder[0].m) + 1;

  // 插入（id 由 MySQL UUID() 生成，注意 CHAR(36) 主键 insertId 无效）
  await pool.query(
    `INSERT INTO categories (user_id, type, name, icon, color, is_system, sort_order)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [userId, payload.type, payload.name, payload.icon || "category", payload.color || "#7A5FE0", nextOrder]
  );
  // 用 user_id + type + name + sort_order 查回（name 同类型唯一 + sort_order 刚算出来）
  const [rows] = await pool.query(
    "SELECT * FROM categories WHERE user_id = ? AND type = ? AND name = ? AND sort_order = ?",
    [userId, payload.type, payload.name, nextOrder]
  );
  return transform(rows[0]);
}

async function updateOne(userId, id, patch) {
  const [existing] = await pool.query(
    "SELECT * FROM categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
    [id, userId]
  );
  if (!existing.length) throw new AppError(ERR.CAT_NOT_FOUND, 404, "分类不存在");
  const cat = existing[0];

  // 内置分类限制
  if (cat.is_system && (patch.name || patch.color || patch.icon)) {
    throw new AppError(ERR.FORBIDDEN, 403, "内置分类不可改名 / 改色 / 改图标");
  }

  // 重名
  if (patch.name) {
    const [dup] = await pool.query(
      "SELECT id FROM categories WHERE user_id = ? AND type = ? AND name = ? AND id != ? AND deleted_at IS NULL",
      [userId, cat.type, patch.name, id]
    );
    if (dup.length) throw new AppError(ERR.CAT_NAME_DUP, 422, "同一类型下已存在同名分类");
  }

  const fields = [];
  const params = [];
  if (patch.name) { fields.push("name = ?"); params.push(patch.name); }
  if (patch.icon) { fields.push("icon = ?"); params.push(patch.icon); }
  if (patch.color) { fields.push("color = ?"); params.push(patch.color); }
  if (patch.status) { fields.push("status = ?"); params.push(patch.status); }
  if (!fields.length) return transform(cat);

  fields.push("updated_at = NOW()");
  params.push(id, userId);
  await pool.query(`UPDATE categories SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`, params);

  const [rows] = await pool.query("SELECT * FROM categories WHERE id = ?", [id]);
  return transform(rows[0]);
}

async function deleteOne(userId, id) {
  const [existing] = await pool.query(
    "SELECT * FROM categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
    [id, userId]
  );
  if (!existing.length) throw new AppError(ERR.CAT_NOT_FOUND, 404, "分类不存在");
  const cat = existing[0];
  if (cat.is_system) throw new AppError(ERR.FORBIDDEN, 403, "内置分类不可删除，可改为停用");

  const [usage] = await pool.query(
    "SELECT COUNT(*) AS n FROM transactions WHERE category_id = ? AND user_id = ? AND deleted_at IS NULL",
    [id, userId]
  );
  if (usage[0].n > 0) {
    throw new AppError(ERR.CAT_HAS_TX, 409, `该分类下有 ${usage[0].n} 条流水，请先迁移到其他分类`);
  }

  // 同时清掉该分类的预算
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM category_budgets WHERE category_id = ? AND user_id = ?", [id, userId]);
    await conn.query("DELETE FROM categories WHERE id = ? AND user_id = ?", [id, userId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return { usage_count: usage[0].n };
}

async function migrateCategory(userId, fromId, targetId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [fromRows] = await conn.query(
      "SELECT id, type FROM categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [fromId, userId]
    );
    if (!fromRows.length) throw new AppError(ERR.CAT_NOT_FOUND, 404, "源分类不存在");

    const [toRows] = await conn.query(
      "SELECT id FROM categories WHERE id = ? AND user_id = ? AND type = ? AND deleted_at IS NULL AND status = 'active' LIMIT 1",
      [targetId, userId, fromRows[0].type]
    );
    if (!toRows.length) throw new AppError(ERR.CAT_HAS_TX, 409, "目标分类不存在或类型不匹配或已停用");

    await conn.query(
      "UPDATE transactions SET category_id = ?, updated_at = NOW(), server_updated_at = NOW() WHERE category_id = ? AND user_id = ?",
      [targetId, fromId, userId]
    );
    await conn.query("DELETE FROM category_budgets WHERE category_id = ? AND user_id = ?", [fromId, userId]);
    await conn.query("DELETE FROM categories WHERE id = ? AND user_id = ?", [fromId, userId]);

    await conn.commit();
    return { migrated: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function reorder(userId, type, orders) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const o of orders) {
      await conn.query(
        "UPDATE categories SET sort_order = ?, updated_at = NOW() WHERE id = ? AND user_id = ? AND type = ?",
        [o.sort_order, o.id, userId, type]
      );
    }
    await conn.commit();
    return { ok: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function transform(r) {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    icon: r.icon,
    color: r.color,
    is_system: !!r.is_system,
    status: r.status,
    sort_order: r.sort_order,
    created_at: r.created_at?.toISOString(),
    updated_at: r.updated_at?.toISOString(),
  };
}

module.exports = { listAll, createOne, updateOne, deleteOne, migrateCategory, reorder };
