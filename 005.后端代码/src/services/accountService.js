const pool = require("../db/pool");
const { AppError, ERR } = require("../utils/error");
const bcrypt = require("../utils/bcrypt");

// 启动时确保 users.display_name 列存在（MySQL 8 不支持 ADD COLUMN IF NOT EXISTS）
async function ensureSchema() {
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'display_name'`
  );
  if (!cols.length) {
    await pool.query("ALTER TABLE users ADD COLUMN display_name VARCHAR(40) NULL AFTER email");
  }
}

async function getMe(userId) {
  const [rows] = await pool.query(
    `SELECT id, email, display_name, theme, timezone, status,
            (email_verified_at IS NOT NULL) AS email_verified,
            last_login_at, created_at
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (!rows.length) throw new AppError(ERR.USER_NOT_FOUND, 404, "用户不存在");
  return {
    id: rows[0].id,
    email: rows[0].email,
    name: rows[0].display_name || null,
    theme: rows[0].theme,
    timezone: rows[0].timezone,
    status: rows[0].status,
    email_verified: !!rows[0].email_verified,
    last_login_at: rows[0].last_login_at?.toISOString() || null,
    created_at: rows[0].created_at?.toISOString(),
  };
}

async function changeName(userId, name) {
  const value = String(name || "").trim();
  if (!value) throw new AppError(ERR.VALIDATION_FAILED, 422, "请输入名字");
  if (value.length > 20) throw new AppError(ERR.VALIDATION_FAILED, 422, "名字不能超过 20 个字");
  await pool.query("UPDATE users SET display_name = ? WHERE id = ?", [value, userId]);
  return getMe(userId);
}

async function changeTheme(userId, theme) {
  await pool.query("UPDATE users SET theme = ? WHERE id = ?", [theme, userId]);
  return getMe(userId);
}

async function changePassword(userId, { old_password, new_password }) {
  const [rows] = await pool.query("SELECT password_hash FROM users WHERE id = ? LIMIT 1", [userId]);
  if (!rows.length) throw new AppError(ERR.USER_NOT_FOUND, 404);
  const ok = await bcrypt.compare(old_password, rows[0].password_hash);
  if (!ok) throw new AppError(ERR.PASSWORD_WEAK, 422, "原密码不正确");

  const newHash = await bcrypt.hash(new_password);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("UPDATE users SET password_hash = ?, password_updated_at = NOW() WHERE id = ?", [newHash, userId]);
    await conn.query("UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL", [userId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return { ok: true };
}

async function deleteAccount(userId, confirm_text) {
  if (confirm_text !== "注销") {
    throw new AppError(ERR.PASSWORD_WEAK, 422, '确认文本必须为"注销"');
  }

  const [rows] = await pool.query("SELECT email FROM users WHERE id = ? LIMIT 1", [userId]);
  if (!rows.length) throw new AppError(ERR.USER_NOT_FOUND, 404, "用户不存在");
  const email = rows[0].email;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 未使用的验证码一并失效（按邮箱，验证码表无 user_id 列）
    await conn.query(
      "UPDATE email_verification_codes SET consumed_at = NOW() WHERE email = ? AND consumed_at IS NULL",
      [email]
    );
    // 按依赖顺序显式清理（categories/budgets/sessions 在库中没有外键约束）
    await conn.query("DELETE FROM category_budgets WHERE user_id = ?", [userId]);
    await conn.query("DELETE FROM transactions WHERE user_id = ?", [userId]);
    await conn.query("DELETE FROM budgets WHERE user_id = ?", [userId]);
    await conn.query("DELETE FROM categories WHERE user_id = ?", [userId]);
    await conn.query("DELETE FROM sessions WHERE user_id = ?", [userId]);
    await conn.query("DELETE FROM users WHERE id = ?", [userId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return { ok: true };
}

module.exports = { ensureSchema, getMe, changeName, changeTheme, changePassword, deleteAccount };
