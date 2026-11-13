-- =====================================================================
-- 轻记账 Pastel Ledger · MySQL 版"模拟行级安全"
-- 文件：03_rls.sql
-- 前置：已执行 01_schema.sql（表结构）
-- 适用：MySQL 8.0+ / MariaDB 10.1+
--
-- 说明：
--   MySQL 不原生支持 PostgreSQL 风格的 RLS（CREATE POLICY ... FOR ALL USING ...）。
--   MySQL 8.0 还额外禁止 VIEW 的 SELECT 里出现用户变量（@xxx），
--   因此以下方案是"数据库辅助 + 应用层兜底"的组合：
--
--     1. 会话变量 + 存储过程查询（替代 VIEW）
--        每次请求开启事务后执行：SET @ledger_user_uuid = '<当前登录用户 uuid>';
--        然后调用存储过程：CALL sp_select_transactions_access();
--        存储过程内部自动按 user_id 过滤，未设置变量则返回空集。
--
--     2. DML 由应用层负责：
--        所有 INSERT/UPDATE/DELETE 必须在 WHERE 条件中显式带 user_id，
--        数据库层用外键 + 应用层校验双重保证。
--
--     3. 数据库权限分离：创建专用应用账号，仅授予必要的表级权限；
--        不要用 root 连接业务数据库。
--
--   生产库建议同时启用 2 + 3；存储过程查询（方案 1）按需启用。
--   联调时可全部注释跳过。
--
-- 执行：mysql -u root -p pastel_ledger < 03_rls.sql
-- =====================================================================

SET NAMES utf8mb4;


-- ---------------------------------------------------------------------
-- 1. RLS 查询存储过程（MySQL 8.0 不能在 VIEW 中使用会话变量，
--    用存储过程替代；MariaDB 10.1+ 仍可使用 VIEW 方案——见文件末尾注释）
-- ---------------------------------------------------------------------

-- 设置会话变量（应用层调用）
-- SET @ledger_user_uuid = '00000000-0000-4000-8000-000000000001';

DROP PROCEDURE IF EXISTS sp_select_transactions_access;
CREATE PROCEDURE sp_select_transactions_access()
BEGIN
    SELECT *
    FROM transactions
    WHERE user_id = IFNULL(@ledger_user_uuid, '00000000-0000-0000-0000-000000000000')
      AND deleted_at IS NULL;
END;

DROP PROCEDURE IF EXISTS sp_select_categories_access;
CREATE PROCEDURE sp_select_categories_access()
BEGIN
    SELECT *
    FROM categories
    WHERE user_id = IFNULL(@ledger_user_uuid, '00000000-0000-0000-0000-000000000000')
      AND deleted_at IS NULL;
END;

DROP PROCEDURE IF EXISTS sp_select_budgets_access;
CREATE PROCEDURE sp_select_budgets_access()
BEGIN
    SELECT *
    FROM budgets
    WHERE user_id = IFNULL(@ledger_user_uuid, '00000000-0000-0000-0000-000000000000');
END;

DROP PROCEDURE IF EXISTS sp_select_users_access;
CREATE PROCEDURE sp_select_users_access()
BEGIN
    SELECT *
    FROM users
    WHERE id = IFNULL(@ledger_user_uuid, '00000000-0000-0000-0000-000000000000');
END;

DROP PROCEDURE IF EXISTS sp_select_sessions_access;
CREATE PROCEDURE sp_select_sessions_access()
BEGIN
    SELECT *
    FROM sessions
    WHERE user_id = IFNULL(@ledger_user_uuid, '00000000-0000-0000-0000-000000000000')
      AND revoked_at IS NULL;
END;

DROP PROCEDURE IF EXISTS sp_select_category_budgets_access;
CREATE PROCEDURE sp_select_category_budgets_access()
BEGIN
    SELECT *
    FROM category_budgets
    WHERE user_id = IFNULL(@ledger_user_uuid, '00000000-0000-0000-0000-000000000000');
END;


-- ---------------------------------------------------------------------
-- 2. 常用辅助存储过程
-- ---------------------------------------------------------------------

-- 标记某用户的所有待同步流水为已同步（模拟前端 markAllSynced）
DROP PROCEDURE IF EXISTS sp_mark_all_synced;
CREATE PROCEDURE sp_mark_all_synced(IN p_user_id CHAR(36))
BEGIN
    UPDATE transactions
    SET server_updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id
      AND deleted_at IS NULL;
    SELECT ROW_COUNT() AS affected_rows;
END;

-- 取当前预算周期起止日期（起始日 X，跨月）
DROP PROCEDURE IF EXISTS sp_budget_period;
CREATE PROCEDURE sp_budget_period(IN p_user_id CHAR(36), OUT p_start DATE, OUT p_end DATE)
BEGIN
    DECLARE v_day INT;
    SELECT period_start_day INTO v_day FROM budgets WHERE user_id = p_user_id LIMIT 1;

    IF DAY(CURDATE()) >= v_day THEN
        SET p_start = STR_TO_DATE(CONCAT(DATE_FORMAT(CURDATE(), '%Y-%m-'), LPAD(v_day, 2, '0')), '%Y-%m-%d');
    ELSE
        SET p_start = STR_TO_DATE(
            CONCAT(DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-'), LPAD(v_day, 2, '0')),
            '%Y-%m-%d'
        );
    END IF;
    SET p_end = DATE_ADD(p_start, INTERVAL 1 MONTH);
END;


-- ---------------------------------------------------------------------
-- 3. 推荐的数据库权限分离（按需执行）
--    创建专用应用账号 ledger_app，仅授予本库的读写权限，
--    密码在下方占位符处替换，并在生产库中启用 SSL。
-- ---------------------------------------------------------------------
--
-- CREATE USER IF NOT EXISTS 'ledger_app'@'%'
--     IDENTIFIED BY '请在此处替换为强密码';
-- ALTER USER 'ledger_app'@'%' REQUIRE SSL;
--
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pastel_ledger.users                   TO 'ledger_app'@'%';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pastel_ledger.email_verification_codes TO 'ledger_app'@'%';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pastel_ledger.sessions                TO 'ledger_app'@'%';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pastel_ledger.categories              TO 'ledger_app'@'%';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pastel_ledger.transactions           TO 'ledger_app'@'%';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pastel_ledger.budgets                TO 'ledger_app'@'%';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pastel_ledger.category_budgets       TO 'ledger_app'@'%';
-- GRANT EXECUTE ON PROCEDURE pastel_ledger.sp_select_transactions_access       TO 'ledger_app'@'%';
-- GRANT EXECUTE ON PROCEDURE pastel_ledger.sp_select_categories_access         TO 'ledger_app'@'%';
-- GRANT EXECUTE ON PROCEDURE pastel_ledger.sp_select_budgets_access            TO 'ledger_app'@'%';
-- GRANT EXECUTE ON PROCEDURE pastel_ledger.sp_mark_all_synced                  TO 'ledger_app'@'%';
-- GRANT EXECUTE ON PROCEDURE pastel_ledger.sp_budget_period                     TO 'ledger_app'@'%';
-- FLUSH PRIVILEGES;
--
-- 之后在应用连接字符串里使用 ledger_app 账号。


-- ---------------------------------------------------------------------
-- 附：MariaDB 10.1+ 兼容方案（VIEW 里可以用用户变量）
--     如果将来要迁移到 MariaDB，可改用以下视图替代存储过程：
--
-- DROP VIEW IF EXISTS v_transactions_access;
-- CREATE VIEW v_transactions_access AS
--     SELECT * FROM transactions
--     WHERE user_id = IFNULL(@ledger_user_uuid, '00000000-0000-0000-0000-000000000000')
--       AND deleted_at IS NULL;
--
-- 同理 v_users_access / v_categories_access / v_budgets_access 等 5 个视图。
-- ---------------------------------------------------------------------
