const app = require("./app");
const config = require("./config");
const mailer = require("./utils/mailer");
const linkSvc = require("./services/linkService");
const accountSvc = require("./services/accountService");

// 启动前自动建表 / 补列
Promise.all([linkSvc.ensureSchema(), accountSvc.ensureSchema()])
  .then(() => {
    console.log("[schema] account_links 表就绪");
    console.log("[schema] users.display_name 列就绪");
  })
  .catch((err) => console.error("[schema] 初始化失败：", err.message));

const server = app.listen(config.port, () => {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  Pastel Ledger · Node 后端                       ║`);
  console.log(`║  监听  http://localhost:${config.port}/api/v1     ║`);
  console.log(`║  健康检查  http://localhost:${config.port}/health║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);

  if (mailer.isConfigured()) {
    mailer.verifyConnection().then((r) => {
      if (r.ok) {
        console.log(`[mail] SMTP 连接正常：${config.smtp.host}:${config.smtp.port}（${config.smtp.user}）`);
      } else {
        console.warn(`[mail] SMTP 连接失败：${r.reason}`);
      }
    });
  } else {
    console.warn("[mail] 未配置 SMTP，验证码将打印到控制台（开发模式）");
  }
});

// 优雅关闭
function shutdown() {
  console.log("\n[server] 收到退出信号，正在关闭…");
  server.close(() => {
    require("./db/pool").end().catch(() => {});
    console.log("[server] 已关闭");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
