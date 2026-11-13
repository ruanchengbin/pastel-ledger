/**
 * mailer.js — 验证码邮件发送（nodemailer + SMTP）
 * 未配置 SMTP 时降级为控制台输出，方便本地开发。
 */

const nodemailer = require("nodemailer");
const config = require("../config");

let transporter = null;
let verified = null; // null = 未校验，true/false = 校验结果

function isConfigured() {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}

function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
}

const PURPOSE_META = {
  register: { title: "注册验证码", action: "完成账号注册" },
  reset_password: { title: "重置密码验证码", action: "重置登录密码" },
};

function buildContent({ code, purpose, expiresMin }) {
  const meta = PURPOSE_META[purpose] || PURPOSE_META.register;
  const subject = `【轻记账】${meta.title}`;
  const text = `【轻记账】${meta.title}：${code}\n\n请在 ${expiresMin} 分钟内使用该验证码${meta.action}。\n如非本人操作，请忽略本邮件。`;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
  <body style="margin:0;padding:24px;background:#f6f3ff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 8px 24px rgba(122,95,224,0.12);">
      <div style="font-size:20px;font-weight:600;color:#3b2f63;margin-bottom:8px;">轻记账</div>
      <div style="font-size:14px;color:#8b82a8;margin-bottom:24px;">${meta.title}</div>
      <p style="font-size:15px;color:#4a4266;line-height:1.6;margin:0 0 16px;">
        你正在${meta.action}，请在 <strong>${expiresMin} 分钟</strong>内输入以下验证码：
      </p>
      <div style="text-align:center;margin:24px 0;">
        <span style="display:inline-block;padding:14px 28px;background:#f3efff;border-radius:12px;font-size:30px;letter-spacing:8px;font-weight:700;color:#7a5fe0;font-family:Menlo,Consolas,monospace;">${code}</span>
      </div>
      <p style="font-size:13px;color:#8b82a8;line-height:1.6;margin:0;">
        如果这不是你本人的操作，请忽略本邮件，你的账号仍然安全。
      </p>
    </div>
    <div style="max-width:480px;margin:16px auto 0;text-align:center;font-size:12px;color:#a9a1c2;">
      本邮件由系统自动发送，请勿直接回复。
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

/**
 * 发送验证码邮件
 * @returns {Promise<{sent: boolean, reason?: string, messageId?: string}>}
 */
async function sendCodeEmail({ to, code, purpose, expiresMin }) {
  const t = getTransporter();
  if (!t) return { sent: false, reason: "SMTP 未配置" };

  const { subject, text, html } = buildContent({ code, purpose, expiresMin });
  const info = await t.sendMail({
    from: config.smtp.from,
    to,
    subject,
    text,
    html,
  });
  return { sent: true, messageId: info.messageId };
}

async function verifyConnection() {
  const t = getTransporter();
  if (!t) return { ok: false, reason: "SMTP 未配置" };
  try {
    await t.verify();
    verified = true;
    return { ok: true };
  } catch (err) {
    verified = false;
    return { ok: false, reason: err.message };
  }
}

module.exports = { isConfigured, sendCodeEmail, verifyConnection, get verified() { return verified; } };
