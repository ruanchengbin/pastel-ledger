require("dotenv").config();

const required = ["DB_USER", "DB_PASSWORD", "DB_NAME", "JWT_SECRET"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[config] 缺少环境变量：${missing.join(", ")}`);
  process.exit(1);
}

module.exports = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN === "*"
      ? "*"
      : process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : "*",

  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    charset: "utf8mb4",
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpiresSec: parseInt(process.env.JWT_ACCESS_EXPIRES_SEC || "900", 10),
    refreshExpiresDays: parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS || "30", 10),
  },

  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || "12", 10),
  codeExpiresMin: parseInt(process.env.CODE_EXPIRES_MIN || "10", 10),

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    // 465 默认 SSL；587 使用 STARTTLS（secure=false）
    secure: (process.env.SMTP_SECURE || "true") === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
  },
};
