const { randomUUID } = require("node:crypto");
const pool = require("../db/pool");
const { AppError, ERR } = require("../utils/error");
const bcrypt = require("../utils/bcrypt");
const { sha256Hex, randomToken, randomCode } = require("../utils/crypto");
const { signAccess } = require("../utils/jwt");
const { sendCodeEmail } = require("../utils/mailer");
const config = require("../config");

// 登录失败计数器（进程内；单机版足够；多实例需 Redis）
const loginFailCounts = new Map(); // key = email.toLowerCase() => { count, lockUntil }

function genExpiresAt(days) {
  return new Date(Date.now() + days * 86_400_000);
}

async function createCode({ email, purpose }) {
  const code = randomCode();
  const codeHash = sha256Hex(code);
  const expiresAt = new Date(Date.now() + config.codeExpiresMin * 60_000);

  const conn = await pool.getConnection();
  try {
    await conn.query(
      `INSERT INTO email_verification_codes
         (id, email, purpose, code_hash, expires_at)
       VALUES (UUID(), ?, ?, ?, ?)`,
      [email, purpose, codeHash, expiresAt]
    );
  } finally {
    conn.release();
  }

  // 发送邮件；未配置 SMTP 时降级为控制台输出（本地开发）
  let mail;
  try {
    mail = await sendCodeEmail({
      to: email,
      code,
      purpose,
      expiresMin: config.codeExpiresMin,
    });
  } catch (err) {
    console.error(`[mail] 验证码发送失败 -> ${email}：${err.message}`);
    throw new AppError(ERR.MAIL_SEND_FAILED, 502, "验证码邮件发送失败，请稍后重试");
  }

  // code 仅在未发信时返回给调用方打日志，不返回给前端
  return { code, delivered: mail.sent, reason: mail.reason };
}

async function register({ email, password, code }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. 检查邮箱唯一
    const [exist] = await conn.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (exist.length) throw new AppError(ERR.EMAIL_EXISTS, 409, "该邮箱已注册，请直接登录");

    // 2. 校验验证码
    const codeHash = sha256Hex(code);
    const [rows] = await conn.query(
      `SELECT id FROM email_verification_codes
       WHERE email = ? AND purpose = 'register'
         AND code_hash = ? AND consumed_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email, codeHash]
    );
    if (!rows.length) throw new AppError(ERR.CODE_INVALID, 422, "验证码无效或已过期");

    // 3. 创建用户（CHAR(36) 主键不能用 insertId 回读，Node 侧生成 UUID 更可靠）
    const passwordHash = await bcrypt.hash(password);
    const userId = randomUUID();
    await conn.query(
      `INSERT INTO users (id, email, password_hash, email_verified_at)
       VALUES (?, ?, ?, NOW())`,
      [userId, email, passwordHash]
    );

    // 4. 标记验证码已消费
    await conn.query(
      "UPDATE email_verification_codes SET consumed_at = NOW() WHERE id = ?",
      [rows[0].id]
    );

    // 5. 写入 12 支出 + 7 收入内置分类
    await conn.query(
      `INSERT INTO categories (user_id, type, name, icon, color, is_system, sort_order) VALUES
       (?, 'expense','餐饮','restaurant','#7A5FE0',1,0),
       (?, 'expense','买菜','shopping_basket','#3E8E7E',1,1),
       (?, 'expense','交通','directions_subway','#D9845B',1,2),
       (?, 'expense','购物','shopping_bag','#C4557A',1,3),
       (?, 'expense','居住','home','#5B7FC7',1,4),
       (?, 'expense','水电','bolt','#9A7B3F',1,5),
       (?, 'expense','通讯','wifi','#6B8E4E',1,6),
       (?, 'expense','娱乐','sports_esports','#6C6A7C',1,7),
       (?, 'expense','医疗','local_hospital','#7A5FE0',1,8),
       (?, 'expense','学习','school','#3E8E7E',1,9),
       (?, 'expense','人情','featured_seasonal_and_gifts','#D9845B',1,10),
       (?, 'expense','其他','category','#C4557A',1,11),
       (?, 'income','工资','payments','#C4557A',1,0),
       (?, 'income','奖金','workspace_premium','#5B7FC7',1,1),
       (?, 'income','兼职','work_history','#9A7B3F',1,2),
       (?, 'income','理财收益','trending_up','#6B8E4E',1,3),
       (?, 'income','红包','card_giftcard','#6C6A7C',1,4),
       (?, 'income','报销','receipt_long','#7A5FE0',1,5),
       (?, 'income','其他','add_circle','#3E8E7E',1,6)`,
      Array(19).fill(userId)
    );

    await conn.commit();
    return createSession(userId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function login({ email, password, remember, ip, userAgent }) {
  // 锁定检查
  const lockInfo = loginFailCounts.get(email);
  if (lockInfo && lockInfo.lockUntil > Date.now()) {
    const leftSec = Math.ceil((lockInfo.lockUntil - Date.now()) / 1000);
    throw new AppError(ERR.ACCOUNT_LOCKED, 401, `登录尝试次数过多，请 ${leftSec} 秒后再试`);
  }

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      "SELECT id, email, password_hash, status FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    if (!rows.length) throw new AppError(ERR.TOKEN_INVALID, 401, "邮箱或密码不正确");
    const user = rows[0];
    if (user.status === "deleted") throw new AppError(ERR.TOKEN_INVALID, 401, "邮箱或密码不正确");

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      const cur = lockInfo || { count: 0, lockUntil: 0 };
      cur.count += 1;
      if (cur.count >= 5) cur.lockUntil = Date.now() + 10 * 60_000;
      loginFailCounts.set(email, cur);
      throw new AppError(ERR.TOKEN_INVALID, 401, "邮箱或密码不正确");
    }

    loginFailCounts.delete(email);

    // 最后登录
    await conn.query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);

    return createSession(user.id, { ip, userAgent, remember });
  } finally {
    conn.release();
  }
}

async function createSession(userId, { ip = null, userAgent = null, remember = true } = {}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const accessToken = signAccess(userId);
    const refreshToken = randomToken(32);
    const refreshHash = sha256Hex(refreshToken);
    const expiresAt = genExpiresAt(remember ? config.jwt.refreshExpiresDays : 1);

    await conn.query(
      `INSERT INTO sessions (user_id, refresh_token_hash, user_agent, ip, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, refreshHash, userAgent, ip, expiresAt]
    );

    const [[user]] = await conn.query(
      "SELECT id, email, display_name, theme, timezone, status, email_verified_at, last_login_at, created_at FROM users WHERE id = ?",
      [userId]
    );

    await conn.commit();
    return {
      user,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: config.jwt.accessExpiresSec,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function refreshAccessToken(refreshToken) {
  const refreshHash = sha256Hex(refreshToken);
  const [rows] = await pool.query(
    `SELECT s.user_id, s.revoked_at, s.expires_at, u.status
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.refresh_token_hash = ? LIMIT 1`,
    [refreshHash]
  );
  if (!rows.length) throw new AppError(ERR.TOKEN_INVALID, 401, "Refresh Token 无效");
  const s = rows[0];
  if (s.revoked_at) throw new AppError(ERR.SESSION_REVOKED, 401, "会话已撤销，请重新登录");
  if (s.expires_at < new Date()) throw new AppError(ERR.SESSION_REVOKED, 401, "会话已过期");
  if (s.status === "deleted") throw new AppError(ERR.SESSION_REVOKED, 401, "账号已注销");

  return {
    access_token: signAccess(s.user_id),
    expires_in: config.jwt.accessExpiresSec,
  };
}

async function logout(userId, refreshToken, all = false) {
  const conn = await pool.getConnection();
  try {
    if (all) {
      await conn.query("UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL", [userId]);
    } else {
      if (refreshToken) {
        const h = sha256Hex(refreshToken);
        await conn.query(
          "UPDATE sessions SET revoked_at = NOW() WHERE refresh_token_hash = ?",
          [h]
        );
      }
    }
  } finally {
    conn.release();
  }
}

async function resetPassword({ email, code, new_password }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [users] = await conn.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (!users.length) throw new AppError(ERR.TOKEN_INVALID, 401, "该邮箱尚未注册");

    const codeHash = sha256Hex(code);
    const [c] = await conn.query(
      `SELECT id FROM email_verification_codes
       WHERE email = ? AND purpose = 'reset_password' AND code_hash = ?
         AND consumed_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email, codeHash]
    );
    if (!c.length) throw new AppError(ERR.CODE_INVALID, 422, "验证码无效或已过期");

    const passwordHash = await bcrypt.hash(new_password);
    await conn.query(
      "UPDATE users SET password_hash = ?, password_updated_at = NOW() WHERE id = ?",
      [passwordHash, users[0].id]
    );
    await conn.query(
      "UPDATE email_verification_codes SET consumed_at = NOW() WHERE id = ?",
      [c[0].id]
    );
    // 所有会话作废
    await conn.query(
      "UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL",
      [users[0].id]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  createCode,
  register,
  login,
  refreshAccessToken,
  logout,
  resetPassword,
};
