const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const config = require("./config");
const errorHandler = require("./middleware/error");
const authRequired = require("./middleware/auth");
const { apiLimiter } = require("./middleware/rateLimit");

const authRoutes = require("./routes/authRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const budgetRoutes = require("./routes/budgetRoutes");
const statsRoutes = require("./routes/statsRoutes");
const syncRoutes = require("./routes/syncRoutes");
const exportRoutes = require("./routes/exportRoutes");
const accountRoutes = require("./routes/accountRoutes");
const linkRoutes = require("./routes/linkRoutes");

const app = express();

// ====== 基础中间件 ======
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// ====== 健康检查 ======
app.get("/health", (_req, res) => {
  res.json({ status: "ok", env: config.nodeEnv });
});

// ====== 路由 ======
app.use("/api/v1/auth", apiLimiter, authRoutes);

// 需要鉴权的路由组
app.use("/api/v1/transactions", apiLimiter, authRequired, transactionRoutes);
app.use("/api/v1/categories", apiLimiter, authRequired, categoryRoutes);
app.use("/api/v1/budgets", apiLimiter, authRequired, budgetRoutes);
app.use("/api/v1/stats", apiLimiter, authRequired, statsRoutes);
app.use("/api/v1/sync", apiLimiter, authRequired, syncRoutes);
app.use("/api/v1/export", apiLimiter, authRequired, exportRoutes);
app.use("/api/v1/account", apiLimiter, authRequired, accountRoutes);
app.use("/api/v1/links", apiLimiter, authRequired, linkRoutes);

// ====== 404 兜底 ======
app.use((_req, res) => {
  res.status(404).json({ code: 40404, data: null, message: "接口不存在" });
});

// ====== 全局错误处理（必须最后） ======
app.use(errorHandler);

module.exports = app;
