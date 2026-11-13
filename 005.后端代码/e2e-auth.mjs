﻿// 登录 / 注册 / 找回密码 端到端验证
// 用法：node e2e-auth.mjs
import fs from "node:fs";

const API = "http://127.0.0.1:3000/api/v1";
const LOG = "C:\\Users\\12780\\AppData\\Local\\Temp\\trae-agent-toolhost\\jobs\\job-a07c2ca94a5843a095edb240fd0600b2\\output.log";

async function req(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

function readCode(email) {
  const text = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "";
  const lines = text.split(/\r?\n/).filter((l) => l.includes(email) && l.includes("验证码已生成"));
  if (!lines.length) return null;
  const last = lines[lines.length - 1];
  const m = last.match(/：(\d{6})/);
  return m ? m[1] : null;
}

const ok = (label, cond, extra = "") =>
  console.log(`${cond ? "✅" : "❌"} ${label}${extra ? "  —  " + extra : ""}`);

(async () => {
  const email = `smoke_${Date.now()}@ledger.app`;
  const password = "abc12345";

  // 0. 健康检查
  const health = await fetch("http://127.0.0.1:3000/health").then((r) => r.json());
  ok("后端健康检查", health.status === "ok");

  // 1. 发送注册验证码
  let r = await req("POST", "/auth/send-code", { email, purpose: "register" });
  ok("发送注册验证码", r.status === 200 && r.json?.code === 0, JSON.stringify(r.json));

  const code = readCode(email);
  ok("从服务端日志读取验证码", !!code, code || "未找到");

  // 2. 注册
  r = await req("POST", "/auth/register", { email, password, code, agree_terms: true });
  ok("注册新账号", r.status === 201 && !!r.json?.data?.access_token, JSON.stringify(r.json).slice(0, 200));
  const regToken = r.json?.data?.access_token;
  const regRefresh = r.json?.data?.refresh_token;
  const userId = r.json?.data?.user?.id;

  // 3. 新用户内置分类是否写入成功（验证 insertId bug 修复）
  const catRes = await fetch(API + "/categories", { headers: { Authorization: "Bearer " + regToken } }).then((x) => x.json());
  const exp = catRes?.data?.expense?.length || 0;
  const inc = catRes?.data?.income?.length || 0;
  ok("新用户自动创建 19 个内置分类", exp === 12 && inc === 7, `expense=${exp} income=${inc}`);

  // 4. 重复注册应失败（邮箱唯一性在验证码校验之前，无需真实验证码）
  r = await req("POST", "/auth/register", { email, password, code: "000000", agree_terms: true });
  ok("重复邮箱注册被拒绝", r.status === 409, `HTTP ${r.status} ${r.json?.message || ""}`);

  // 5. 登录
  r = await req("POST", "/auth/login", { email, password });
  ok("登录成功", r.status === 200 && !!r.json?.data?.access_token);
  const token = r.json?.data?.access_token;
  const refresh = r.json?.data?.refresh_token;

  // 6. 错误密码
  r = await req("POST", "/auth/login", { email, password: "wrong123" });
  ok("错误密码返回 401", r.status === 401);

  // 7. 刷新 token
  r = await req("POST", "/auth/refresh", { refresh_token: refresh });
  ok("刷新 Access Token", r.status === 200 && !!r.json?.data?.access_token);

  // 8. 登出
  r = await fetch(API + "/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ refresh_token: refresh }),
  }).then(async (x) => ({ status: x.status, json: await x.json() }));
  ok("登出成功", r.status === 200 && r.json?.code === 0, JSON.stringify(r.json));

  // 9. 找回密码
  await req("POST", "/auth/send-code", { email, purpose: "reset_password" });
  const resetCode = readCode(email);
  ok("读取重置密码验证码", !!resetCode, resetCode || "未找到");
  r = await req("POST", "/auth/reset-password", { email, code: resetCode, new_password: "newpass123" });
  ok("重置密码", r.status === 200 && r.json?.code === 0);

  // 10. 新密码登录
  r = await req("POST", "/auth/login", { email, password: "newpass123" });
  ok("使用新密码登录", r.status === 200 && !!r.json?.data?.access_token);

  // 11. 清理测试账号
  const deleteToken = r.json?.data?.access_token;
  const del = await fetch(API + "/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + deleteToken },
    body: JSON.stringify({ confirm_text: "注销" }),
  });
  ok("注销测试账号", del.status === 200, `HTTP ${del.status}`);

  console.log("\nuserId:", userId);
})();




