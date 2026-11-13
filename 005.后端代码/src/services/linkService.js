const { randomUUID } = require("node:crypto");
const pool = require("../db/pool");
const { AppError, ERR } = require("../utils/error");

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_links (
      id CHAR(36) PRIMARY KEY,
      requester_id CHAR(36) NOT NULL,
      target_id    CHAR(36) NOT NULL,
      status       ENUM('pending','accepted','rejected','cancelled','revoked') NOT NULL DEFAULT 'pending',
      message      VARCHAR(200),
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      accepted_at  DATETIME NULL,
      UNIQUE KEY pair_req_once (requester_id, target_id, status, created_at),
      INDEX idx_requester_status (requester_id, status),
      INDEX idx_target_status (target_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// 列出与 userId 有关联的所有用户（仅含 accepted 状态）
async function listAcceptedPartners(userId) {
  const [rows] = await pool.query(
    `SELECT
        CASE WHEN requester_id = ? THEN target_id ELSE requester_id END AS partner_id,
        partner.email AS partner_email, partner.theme AS partner_theme,
        partner.display_name AS partner_name,
        l.accepted_at
     FROM account_links l
     JOIN users partner ON partner.id = CASE WHEN requester_id = ? THEN target_id ELSE requester_id END
     WHERE l.status = 'accepted'
       AND (l.requester_id = ? OR l.target_id = ?)
       AND partner.status <> 'deleted'
       AND partner.email IS NOT NULL`,
    [userId, userId, userId, userId]
  );
  return rows.map((r) => ({
    id: r.partner_id,
    email: r.partner_email,
    name: r.partner_name || null,
    theme: r.partner_theme || null,
    accepted_at: r.accepted_at ? r.accepted_at.toISOString() : null,
  }));
}

// 完整关联列表（含 pending/rejected 记录）用于设置页展示
async function listAll(userId) {
  const [rows] = await pool.query(
    `SELECT l.id, l.status, l.message, l.created_at, l.accepted_at,
            CASE WHEN l.requester_id = ? THEN 'requester' ELSE 'target' END AS role,
            CASE WHEN l.requester_id = ? THEN l.target_id ELSE l.requester_id END AS partner_id,
            partner.email AS partner_email, partner.theme AS partner_theme,
            partner.display_name AS partner_name
     FROM account_links l
     JOIN users partner ON partner.id = CASE WHEN l.requester_id = ? THEN l.target_id ELSE l.requester_id END
     WHERE (l.requester_id = ? OR l.target_id = ?)
     ORDER BY l.created_at DESC`,
    [userId, userId, userId, userId, userId]
  );
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    role: r.role,
    message: r.message,
    created_at: r.created_at ? r.created_at.toISOString() : null,
    accepted_at: r.accepted_at ? r.accepted_at.toISOString() : null,
    partner: { id: r.partner_id, email: r.partner_email, name: r.partner_name || null, theme: r.partner_theme || null },
  }));
}

// 发起关联请求
async function request({ requesterId, targetEmail, message }) {
  const email = String(targetEmail || "").trim().toLowerCase();
  if (!email) throw new AppError(ERR.VALIDATION_FAILED, 400, "请输入对方邮箱");
  if (email.length > 120) throw new AppError(ERR.VALIDATION_FAILED, 400, "邮箱太长");
  if (email.toLowerCase() === "demo@ledger.app" || email === "demo@ledger.app" && requesterId && targetEmail.toLowerCase() === "demo@ledger.app" && requesterId === null) { /* placeholder */ }

  const [targets] = await pool.query(
    "SELECT id, email, status FROM users WHERE LOWER(email) = ? LIMIT 1",
    [email.toLowerCase()]
  );
  if (!targets.length) throw new AppError(ERR.LINK_TARGET_NOT_FOUND, 404, "该邮箱尚未注册");
  const target = targets[0];
  if (target.status === "deleted") throw new AppError(ERR.LINK_TARGET_NOT_FOUND, 404, "该账户不存在");
  if (target.id === requesterId) throw new AppError(ERR.VALIDATION_FAILED, 400, "不能和自己关联");

  // 已存在 accepted 关联 — 幂等返回
  const [accepted] = await pool.query(
    `SELECT id FROM account_links
     WHERE status = 'accepted'
       AND ((requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?))
     LIMIT 1`,
    [requesterId, target.id, target.id, requesterId]
  );
  if (accepted.length) {
    const me = await listAll(requesterId);
    return me;
  }

  // 同一 pair 已有 pending 请求（不管谁发的）— 拒绝重复
  const [pending] = await pool.query(
    `SELECT id, requester_id FROM account_links
     WHERE status = 'pending'
       AND ((requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?))
     LIMIT 1`,
    [requesterId, target.id, target.id, requesterId]
  );
  if (pending.length) {
    const existed = pending[0];
    if (existed.requester_id === requesterId) {
      throw new AppError(ERR.LINK_ALREADY_PENDING, 409, "你已向这个邮箱发送过关联请求");
    }
    // 对方发过来了 — 直接自动 accepted
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        "UPDATE account_links SET status = 'accepted', accepted_at = NOW() WHERE id = ?",
        [existed.id]
      );
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return await listAll(requesterId);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO account_links (id, requester_id, target_id, status, message)
       VALUES (?, ?, ?, 'pending', ?)`,
      [randomUUID(), requesterId, target.id, message ? String(message).slice(0, 200) : null]
    );
    await conn.commit();
  } catch (err) { await conn.rollback(); throw err; }
  finally { conn.release(); }

  return await listAll(requesterId);
}

// 接受 / 拒绝 / 取消 / 解除
async function update({ userId, linkId, action }) {
  const [rows] = await pool.query(
    "SELECT * FROM account_links WHERE id = ? LIMIT 1",
    [linkId]
  );
  if (!rows.length) throw new AppError(ERR.LINK_NOT_FOUND, 404, "关联记录不存在");
  const link = rows[0];

  const isRequester = link.requester_id === userId;
  const isTarget = link.target_id === userId;
  if (!isRequester && !isTarget) throw new AppError(ERR.FORBIDDEN, 403, "无权操作");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (action === "accept") {
      if (!isTarget) throw new AppError(ERR.LINK_INVALID_STATE, 409, "你只能接受别人发给你的请求");
      if (link.status !== "pending") throw new AppError(ERR.LINK_INVALID_STATE, 409, "该请求已处理过");
      await conn.query(
        "UPDATE account_links SET status = 'accepted', accepted_at = NOW() WHERE id = ?",
        [linkId]
      );
    } else if (action === "reject") {
      if (!isTarget) throw new AppError(ERR.LINK_INVALID_STATE, 409, "你只能拒绝发给你的请求");
      if (link.status !== "pending") throw new AppError(ERR.LINK_INVALID_STATE, 409, "该请求已处理过");
      await conn.query(
        "UPDATE account_links SET status = 'rejected' WHERE id = ?",
        [linkId]
      );
    } else if (action === "cancel") {
      if (!isRequester) throw new AppError(ERR.LINK_INVALID_STATE, 409, "你只能取消自己发起的请求");
      if (link.status !== "pending") throw new AppError(ERR.LINK_INVALID_STATE, 409, "该请求已处理过");
      await conn.query(
        "UPDATE account_links SET status = 'cancelled' WHERE id = ?",
        [linkId]
      );
    } else if (action === "revoke") {
      if (link.status !== "accepted") throw new AppError(ERR.LINK_INVALID_STATE, 409, "只能解除已关联的账户");
      await conn.query(
        "UPDATE account_links SET status = 'revoked' WHERE id = ?",
        [linkId]
      );
    } else {
      throw new AppError(ERR.VALIDATION_FAILED, 400, "未知操作");
    }

    await conn.commit();
  } catch (err) { await conn.rollback(); throw err; }
  finally { conn.release(); }

  return await listAll(userId);
}

// 解析一个"有效可见"账户列表：我自己 + 所有已关联的人
async function resolveVisibleAccounts(userId) {
  const partners = await listAcceptedPartners(userId);
  const emails = [{ id: userId, email: null, theme: null }];
  partners.forEach(function (p) {
    emails.push({ id: p.id, email: p.email, theme: p.theme });
  });
  return emails;
}

module.exports = {
  ensureSchema,
  request,
  listAll,
  listAcceptedPartners,
  update,
  resolveVisibleAccounts,
  pairKey,
};
