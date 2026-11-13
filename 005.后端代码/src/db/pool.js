const mysql = require("mysql2/promise");
const config = require("../config");

// DATE 类型按字符串返回，避免 toISOString 因时区偏移导致日期少一天
const pool = mysql.createPool({ ...config.db, dateStrings: ["DATE"] });

// 启动时验证连接
(async () => {
  try {
    const c = await pool.getConnection();
    const [rows] = await c.query("SELECT VERSION() AS v");
    console.log(`[db] MySQL 连接成功：${rows[0].v} @ ${config.db.host}:${config.db.port}/${config.db.database}`);
    c.release();
  } catch (err) {
    console.error(`[db] MySQL 连接失败：${err.message}`);
    console.error("     请确认 MySQL 已启动并执行了 004.数据库脚本 下的 01/02/03 SQL 文件。");
    process.exit(1);
  }
})();

module.exports = pool;
