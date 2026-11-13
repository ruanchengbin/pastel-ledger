// ===== 冒烟测试脚本：覆盖全部 36 个端点的关键路径 =====
// 用法：先启动 server (npm start)，再执行：node smoke.mjs

const ROOT = "http://127.0.0.1:3000";
const API = ROOT + "/api/v1";

async function request(method, path, body = null, headers = {}, base = API) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body !== null) opts.body = JSON.stringify(body);
  const r = await fetch(base + path, opts);
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: r.status, data, raw: text.slice(0, 300) };
}

// 生成标准 UUID v4（与 zod validator 的 uuidRe 匹配：8-4-4-4-12）
function genUUID() {
  const h = (n) => {
    let s = "";
    for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  };
  // time_low(8) - time_mid(4) - time_hi_and_version(4, 首字符为4) - clock_seq(4, 首字符8/a/b) - node(12)
  const clockSeq = (8 + Math.floor(Math.random() * 4)).toString(16) + h(3);
  return `${h(8)}-${h(4)}-4${h(3)}-${clockSeq}-${h(12)}`;
}

// 安全日期：用昨天避免 UTC 时区导致"日期晚于今天"校验失败
function safeDate(offsetDays = 0) {
  const d = new Date(Date.now() - offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

let token = "";
let refreshToken = "";
const results = [];

function assert(label, cond, detail = "") {
  results.push({ label, pass: !!cond, detail });
  const mark = cond ? "✅" : "❌";
  console.log(`${mark} ${label}${detail ? "  —  " + detail : ""}`);
}

async function main() {
  console.log("=== 轻记账后端冒烟测试 ===\n");

  // --- 健康检查（根路径） ---
  let r = await request("GET", "/health", null, {}, ROOT);
  assert("健康检查 200", r.status === 200 && r.data?.status === "ok", r.raw);

  // --- Auth ---
  r = await request("POST", "/auth/login", { email: "demo@ledger.app", password: "demo1234" });
  assert("登录 demo@ledger.app / demo1234", r.status === 200 && r.data?.data?.access_token, `HTTP ${r.status}`);
  token = r.data?.data?.access_token;
  refreshToken = r.data?.data?.refresh_token;

  const h = { Authorization: `Bearer ${token}` };

  r = await request("POST", "/auth/login", { email: "demo@ledger.app", password: "wrong" });
  assert("密码错误返回 401", r.status === 401, `HTTP ${r.status}`);

  r = await request("POST", "/auth/refresh", { refresh_token: refreshToken });
  assert("刷新 token", r.status === 200 && r.data?.data?.access_token);

  // --- Account ---
  r = await request("GET", "/account/me", null, h);
  assert("GET /account/me", r.status === 200 && r.data?.data?.email === "demo@ledger.app");

  // --- Transactions ---
  r = await request("GET", "/transactions?limit=100&month=2026-11", null, h);
  assert("GET /transactions 列表", r.status === 200);
  const items = r.data?.data?.items || [];
  assert("当月有流水返回", Array.isArray(items), `items=${items.length}`);

  const newTxId = genUUID();
  r = await request("POST", "/transactions", {
    id: newTxId, type: "expense", amount: 12.34,
    category_id: "10000000-0000-4000-8000-000000000001",
    occurred_on: safeDate(1), note: "smoke test"
  }, h);
  assert("POST /transactions 创建", r.status === 201 && r.data?.data?.id === newTxId, `HTTP ${r.status}`);

  r = await request("GET", `/transactions/${newTxId}`, null, h);
  assert("GET /transactions/:id", r.status === 200 && r.data?.data?.note === "smoke test");

  r = await request("PUT", `/transactions/${newTxId}`, { amount: 15.00 }, h);
  assert("PUT /transactions/:id", r.status === 200 && r.data?.data?.version === 2);

  r = await request("DELETE", `/transactions/${newTxId}`, null, h);
  assert("DELETE /transactions/:id", r.status === 200 && r.data?.data?.undo_expires_at);

  r = await request("POST", `/transactions/${newTxId}/restore`, null, h);
  assert("POST /transactions/:id/restore", r.status === 200);

  // --- Categories ---
  r = await request("GET", "/categories", null, h);
  assert("GET /categories (全部)", r.status === 200);
  assert("19 分类 (12 支出 + 7 收入)",
    (r.data?.data?.expense || []).length === 12 && (r.data?.data?.income || []).length === 7,
    `expense=${r.data?.data?.expense?.length} income=${r.data?.data?.income?.length}`);

  r = await request("POST", "/categories", { type: "expense", name: "冒烟测试", icon: "bug", color: "#FF00FF" }, h);
  assert("POST /categories 新建", r.status === 201 && r.data?.data?.name === "冒烟测试");
  const catId = r.data?.data?.id;

  r = await request("PUT", `/categories/${catId}`, { name: "冒烟分类2" }, h);
  assert("PUT /categories/:id", r.status === 200);

  r = await request("PUT", "/categories/order", { type: "expense", orders: [{ id: catId, sort_order: 50 }] }, h);
  assert("PUT /categories/order", r.status === 200);

  r = await request("DELETE", `/categories/${catId}`, null, h);
  assert("DELETE /categories/:id", r.status === 200);

  // --- Budgets ---
  r = await request("GET", "/budgets", null, h);
  assert("GET /budgets", r.status === 200 && r.data?.data?.period_start_day === 1);

  r = await request("PUT", "/budgets", {
    period_start_day: 1, total_amount_yuan: 6500,
    category_budgets: [{ category_id: "10000000-0000-4000-8000-000000000001", amount_yuan: 1600 }]
  }, h);
  assert("PUT /budgets 保存", r.status === 200);

  r = await request("GET", "/budgets/progress", null, h);
  assert("GET /budgets/progress", r.status === 200 && typeof r.data?.data?.consumption_rate === "number");

  // --- Stats ---
  r = await request("GET", "/stats/summary", null, h);
  assert("GET /stats/summary", r.status === 200 && typeof r.data?.data?.transaction_count === "number");

  r = await request("GET", "/stats/breakdown?type=expense", null, h);
  assert("GET /stats/breakdown", r.status === 200 && Array.isArray(r.data?.data));

  r = await request("GET", "/stats/trend?months=3", null, h);
  assert("GET /stats/trend", r.status === 200 && Array.isArray(r.data?.data) && r.data?.data?.length === 3,
    `len=${r.data?.data?.length} body=${r.raw}`);

  r = await request("GET", "/stats/comparison?month=2026-11", null, h);
  assert("GET /stats/comparison", r.status === 200);

  // --- Sync ---
  r = await request("GET", "/sync/pull?since=1970-01-01T00:00:00Z", null, h);
  assert("GET /sync/pull", r.status === 200);

  r = await request("GET", "/sync/full", null, h);
  assert("GET /sync/full", r.status === 200);

  r = await request("POST", "/sync/push", {
    transactions: [{
      id: genUUID(), type: "expense", amount: 3.50,
      category_id: "10000000-0000-4000-8000-000000000001",
      occurred_on: safeDate(1), note: "sync test"
    }]
  }, h);
  assert("POST /sync/push", r.status === 200);

  // --- Export（直接返回文件流，不走 {code,data} 包裹） ---
  r = await request("GET", "/export/json", null, h);
  assert("GET /export/json", r.status === 200 && r.data?.app === "pastel-ledger", `HTTP ${r.status} raw=${r.raw.slice(0, 100)}`);

  r = await request("GET", "/export/csv", null, h);
  assert("GET /export/csv", r.status === 200 && r.raw.length > 0, `HTTP ${r.status}`);

  // --- 账号 ---
  r = await request("PUT", "/account/theme", { theme: "ocean" }, h);
  assert("PUT /account/theme", r.status === 200 && r.data?.data?.theme === "ocean");

  // --- 未授权 ---
  r = await request("GET", "/transactions");
  assert("无 token 返回 401", r.status === 401);

  // --- 汇总 ---
  const pass = results.filter((x) => x.pass).length;
  const fail = results.length - pass;
  console.log(`\n╔══════════════════════════════╗`);
  console.log(`║  通过 ${pass}/${results.length}   ${fail ? `${fail} 失败 ❌` : "全部通过 ✅"} ║`);
  console.log(`╚══════════════════════════════╝`);
  if (fail) {
    console.log("\n失败项：");
    for (const x of results.filter((x) => !x.pass)) console.log("  ❌", x.label, x.detail);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
