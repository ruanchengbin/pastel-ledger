-- =====================================================================
-- 轻记账 Pastel Ledger · 演示数据脚本
-- 文件：02_seed_demo.sql
-- 前置：已执行 01_schema.sql
-- 适用：MySQL 8.0+ / MariaDB 10.1+
--
-- 说明：
--   1. 创建演示账号 demo@ledger.app / demo1234；
--   2. 复制前端内置的 12 个支出分类与 7 个收入分类；
--   3. 生成最近 6 个月的演示流水与当月预算，便于联调；
--   4. 脚本可重复执行：每次先删除演示账号（级联分类、流水、预算、会话）再重建。
--
-- 注意：本脚本开头临时 SET FOREIGN_KEY_CHECKS=0 以便重建顺序灵活，
--       末尾已恢复为 1。生产库执行无需改动。
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

BEGIN;

-- ---------------------------------------------------------------------
-- 0. 清理旧演示账号（级联删除 categories / transactions / budgets / category_budgets）
-- ---------------------------------------------------------------------
DELETE FROM category_budgets;
DELETE FROM budgets;
DELETE FROM transactions;
DELETE FROM categories;
DELETE FROM sessions;
DELETE FROM email_verification_codes;
DELETE FROM users WHERE email = 'demo@ledger.app';

-- ---------------------------------------------------------------------
-- 1. 演示账号（密码：demo1234，bcrypt cost=10）
-- ---------------------------------------------------------------------
INSERT INTO users (id, email, password_hash, email_verified_at, last_login_at, theme)
VALUES (
    '00000000-0000-4000-8000-000000000001',
    'demo@ledger.app',
    '$2b$10$ffxoKaZ4rmozfy5o2E0ejuDbyCdgl/IMBCIhKavndnwLGIf9d.B36',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'macaron'
);

-- ---------------------------------------------------------------------
-- 2. 内置分类（支出 12 个）—— 与前端 Store.CATEGORIES 完全对齐
-- ---------------------------------------------------------------------
INSERT INTO categories (id, user_id, type, name, icon, color, is_system, sort_order) VALUES
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','expense','餐饮','restaurant','#7A5FE0', 1, 0),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','expense','买菜','shopping_basket','#3E8E7E', 1, 1),
('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','expense','交通','directions_subway','#D9845B', 1, 2),
('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','expense','购物','shopping_bag','#C4557A', 1, 3),
('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','expense','居住','home','#5B7FC7', 1, 4),
('10000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','expense','水电','bolt','#9A7B3F', 1, 5),
('10000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','expense','通讯','wifi','#6B8E4E', 1, 6),
('10000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000001','expense','娱乐','sports_esports','#6C6A7C', 1, 7),
('10000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000001','expense','医疗','local_hospital','#7A5FE0', 1, 8),
('10000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','expense','学习','school','#3E8E7E', 1, 9),
('10000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','expense','人情','featured_seasonal_and_gifts','#D9845B', 1, 10),
('10000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','expense','其他','category','#C4557A', 1, 11);

-- ---------------------------------------------------------------------
-- 3. 内置分类（收入 7 个）
-- ---------------------------------------------------------------------
INSERT INTO categories (id, user_id, type, name, icon, color, is_system, sort_order) VALUES
('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','income','工资','payments','#C4557A', 1, 0),
('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','income','奖金','workspace_premium','#5B7FC7', 1, 1),
('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','income','兼职','work_history','#9A7B3F', 1, 2),
('20000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','income','理财收益','trending_up','#6B8E4E', 1, 3),
('20000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','income','红包','card_giftcard','#6C6A7C', 1, 4),
('20000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','income','报销','receipt_long','#7A5FE0', 1, 5),
('20000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','income','其他','add_circle','#3E8E7E', 1, 6);

-- ---------------------------------------------------------------------
-- 4. 预算配置（总预算 6,000.00 元，周期起始日 1）
-- ---------------------------------------------------------------------
INSERT INTO budgets (user_id, period_start_day, total_amount_cents)
VALUES ('00000000-0000-4000-8000-000000000001', 1, 600000);

INSERT INTO category_budgets (id, user_id, category_id, amount_cents) VALUES
('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',150000),
('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004',120000),
('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003', 40000);

-- ---------------------------------------------------------------------
-- 5. 最近 6 个月的演示流水
--    支出：每月 12 笔，分类在 12 个支出分类中轮换，金额 20.00 ~ 399.00 元
--    日期不超过今天（LAST_DAY 取月末再与 CURDATE() 取小）
-- ---------------------------------------------------------------------

-- 5.1 批量插入 72 笔支出
-- MariaDB 10.1 不支持 WITH RECURSIVE，改用 UNION ALL 硬编码 1..6 与 1..12
INSERT INTO transactions (id, user_id, category_id, type, amount_cents, occurred_on, note)
SELECT
    UUID(),
    '00000000-0000-4000-8000-000000000001',
    CASE MOD(idx - 1, 12)
        WHEN 0 THEN '10000000-0000-4000-8000-000000000001'
        WHEN 1 THEN '10000000-0000-4000-8000-000000000002'
        WHEN 2 THEN '10000000-0000-4000-8000-000000000003'
        WHEN 3 THEN '10000000-0000-4000-8000-000000000004'
        WHEN 4 THEN '10000000-0000-4000-8000-000000000005'
        WHEN 5 THEN '10000000-0000-4000-8000-000000000006'
        WHEN 6 THEN '10000000-0000-4000-8000-000000000007'
        WHEN 7 THEN '10000000-0000-4000-8000-000000000008'
        WHEN 8 THEN '10000000-0000-4000-8000-000000000009'
        WHEN 9 THEN '10000000-0000-4000-8000-000000000010'
        WHEN 10 THEN '10000000-0000-4000-8000-000000000011'
        ELSE        '10000000-0000-4000-8000-000000000012'
    END,
    'expense',
    ((idx * 37 + m * 53) MOD 380 + 20) * 100,
    LEAST(
        DATE_ADD(
            DATE_SUB(CURDATE(), INTERVAL (m - 1) MONTH),
            INTERVAL ((idx * 2) % 27) DAY
        ),
        CURDATE()
    ),
    '演示支出'
FROM
    (SELECT 1 m UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6) mm
CROSS JOIN
    (SELECT 1 idx UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
     UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12) ii;

-- 5.2 每月 1 笔工资（6 笔收入）
INSERT INTO transactions (id, user_id, category_id, type, amount_cents, occurred_on, note)
SELECT
    UUID(),
    '00000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',   -- 工资分类
    'income',
    1200000,
    LEAST(
        DATE_ADD(DATE_SUB(CURDATE(), INTERVAL (m - 1) MONTH), INTERVAL 4 DAY),
        CURDATE()
    ),
    '工资'
FROM (
    SELECT 1 m UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
) mm;

COMMIT;

-- ---------------------------------------------------------------------
-- 6. 验证查询
-- ---------------------------------------------------------------------
SELECT
    DATE_FORMAT(occurred_on, '%Y-%m')                                   AS month,
    SUM(CASE WHEN type = 'expense' THEN 1 ELSE 0 END)                  AS expense_count,
    ROUND(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) / 100, 2) AS expense_yuan,
    SUM(CASE WHEN type = 'income'  THEN 1 ELSE 0 END)                  AS income_count,
    ROUND(SUM(CASE WHEN type = 'income'  THEN amount_cents ELSE 0 END) / 100, 2) AS income_yuan
FROM transactions
WHERE user_id = '00000000-0000-4000-8000-000000000001'
  AND deleted_at IS NULL
GROUP BY 1
ORDER BY 1 DESC;

SET FOREIGN_KEY_CHECKS = 1;
