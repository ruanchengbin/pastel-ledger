-- =====================================================================
-- 轻记账 Pastel Ledger · 数据库结构脚本
-- 文件：01_schema.sql
-- 适用：MySQL 8.0+  /  MariaDB 10.1+（双兼容）
-- 字符集：utf8mb4（含 emoji 与扩展中文）
--
-- 说明：
--   1. 本脚本只负责建表、索引、触发器与注释，不写入演示数据；
--   2. 演示数据见 02_seed_demo.sql，可选的"模拟行级安全"见 03_rls.sql；
--   3. 主题、分类图标等取值已与前端项目 003.前端代码 对齐；
--   4. UUID 使用 CHAR(36) + DEFAULT (UUID())，
--      末尾的 BEFORE INSERT 触发器为 MariaDB 10.1 防御层（共存无副作用）；
--   5. DATETIME(3) 毫秒精度，前端 Store.js 用 Date.now() 对齐；
--   6. 密码 bcrypt / 验证码 SHA256 由应用层负责，MySQL 不做明文或弱哈希。
--
-- 执行方式：
--   mysql -u root -p <<EOF
--   CREATE DATABASE pastel_ledger DEFAULT CHAR SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   USE pastel_ledger;
--   SOURCE 01_schema.sql;
--   SOURCE 02_seed_demo.sql;
--   SOURCE 03_rls.sql;
--   EOF
--   或：mysql -u root -p pastel_ledger < 01_schema.sql
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- ---------------------------------------------------------------------
-- 重复初始化时，取消下面一行的注释可清空旧结构（会丢失全部数据）
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS category_budgets;
DROP TABLE IF EXISTS budgets;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS email_verification_codes;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;


-- =====================================================================
-- 1. 用户
-- =====================================================================
CREATE TABLE users (
    id                  CHAR(36)        PRIMARY KEY DEFAULT (UUID())
                        COMMENT 'MySQL 8 表达式默认值自动生成；客户端可提前生成，兼容离线注册',
    email               VARCHAR(255)    NOT NULL
                        COMMENT '大小写不敏感唯一；注销后允许同邮箱重新注册',
    password_hash       VARCHAR(64)     NOT NULL
                        COMMENT 'bcrypt($2a$) / argon2 哈希，禁止明文',
    password_updated_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    timezone            VARCHAR(40)     NOT NULL DEFAULT 'Asia/Shanghai'
                        COMMENT '用户所在时区，仅用于提醒与展示',
    -- 与前端 theme.js 的 4 套主题保持一致
    theme               VARCHAR(20)     NOT NULL DEFAULT 'macaron'
                        CHECK (theme IN ('macaron','ocean','mint','apricot'))
                        COMMENT '主题：macaron/ocean/mint/apricot',
    status              VARCHAR(10)     NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','deleted')),
    email_verified_at   DATETIME(3)     NULL,
    last_login_at       DATETIME(3)     NULL,
    created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at          DATETIME(3)     NULL,

    -- 邮箱唯一：应用层转小写后写入；deleted_at 非空时软删不冲突
    UNIQUE INDEX ux_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='账号表：邮箱登录，软删除保留历史';


-- =====================================================================
-- 2. 邮箱验证码（注册 / 重置密码）
-- =====================================================================
CREATE TABLE email_verification_codes (
    id            CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    email         VARCHAR(255) NOT NULL,
    purpose       VARCHAR(20)  NOT NULL
                  CHECK (purpose IN ('register','reset_password')),
    code_hash     CHAR(64)     NOT NULL
                  COMMENT 'SHA-256 十六进制，不存明文',
    attempt_count TINYINT UNSIGNED NOT NULL DEFAULT 0
                  CHECK (attempt_count BETWEEN 0 AND 10),
    expires_at    DATETIME(3)  NOT NULL,
    consumed_at   DATETIME(3)  NULL,
    created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='邮箱验证码：注册与找回密码共用，验证后写入 consumed_at';

CREATE INDEX ix_evc_lookup
    ON email_verification_codes (email, purpose, created_at DESC);


-- =====================================================================
-- 3. 登录会话（30 天免登录、退出登录、改密后强制下线）
-- =====================================================================
CREATE TABLE sessions (
    id                 CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    user_id            CHAR(36)     NOT NULL
                        COMMENT 'REFERENCES users(id) ON DELETE CASCADE',
    refresh_token_hash CHAR(64)     NOT NULL
                        COMMENT 'SHA-256，退出或改密时废弃',
    user_agent         VARCHAR(512) NULL,
    ip                 VARCHAR(45)  NULL
                        COMMENT 'IPv4/IPv6 文本形式',
    last_seen_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expires_at         DATETIME(3)  NOT NULL,
    revoked_at         DATETIME(3)  NULL,
    created_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX ux_sessions_token (refresh_token_hash),
    INDEX ix_sessions_user (user_id, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='登录会话：refresh token 只存哈希，退出或改密时置 revoked_at';


-- =====================================================================
-- 4. 分类（注册时为每个账号复制一套内置分类）
-- =====================================================================
CREATE TABLE categories (
    id          CHAR(36)    PRIMARY KEY DEFAULT (UUID()),
    user_id     CHAR(36)    NOT NULL
                COMMENT 'REFERENCES users(id) ON DELETE CASCADE',
    type        VARCHAR(10) NOT NULL CHECK (type IN ('expense','income')),
    name        VARCHAR(8)  NOT NULL
                COMMENT '长度 1–8 个字符',
    icon        VARCHAR(40) NOT NULL DEFAULT 'category'
                COMMENT 'Material Symbols 名称，对应前端图标',
    color       CHAR(7)     NOT NULL
                CHECK (color REGEXP '^#[0-9A-Fa-f]{6}$')
                COMMENT '十六进制色值如 #7A5FE0',
    is_system   TINYINT(1)  NOT NULL DEFAULT 0
                COMMENT '内置分类：前端据此隐藏删除入口',
    status      VARCHAR(10) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','disabled')),
    sort_order  INT         NOT NULL DEFAULT 0,
    created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at  DATETIME(3) NULL,

    -- 供 transactions 的复合外键使用
    UNIQUE INDEX ux_cat_id_user (id, user_id),
    UNIQUE INDEX ux_cat_id_user_type (id, user_id, type),

    INDEX ix_categories_user_type (user_id, type, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='分类：支出 / 收入两套，内置与自定义共用一张表';


-- =====================================================================
-- 5. 流水（支出 / 收入）
-- =====================================================================
CREATE TABLE transactions (
    id                CHAR(36)    PRIMARY KEY DEFAULT (UUID()),
    user_id           CHAR(36)    NOT NULL,
    category_id       CHAR(36)    NOT NULL,
    type              VARCHAR(10) NOT NULL CHECK (type IN ('expense','income')),
    amount_cents      BIGINT UNSIGNED NOT NULL
                     CHECK (amount_cents BETWEEN 1 AND 999999999)
                     COMMENT '0.01 ~ 9,999,999.99 元；分单位存储避免浮点误差',
    occurred_on       DATE        NOT NULL
                     COMMENT '用户本地日历日期，决定月份归属',
    note              VARCHAR(50) NULL,
    version           INT         NOT NULL DEFAULT 1
                     COMMENT '乐观锁；应用层 UPDATE 时带 WHERE version = ?',
    client_id         VARCHAR(64) NULL
                     COMMENT '来源设备标识，便于排查',
    created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                     ON UPDATE CURRENT_TIMESTAMP(3),
    server_updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                     ON UPDATE CURRENT_TIMESTAMP(3)
                     COMMENT '增量同步拉取游标',
    deleted_at        DATETIME(3) NULL,

    INDEX ix_tx_user_date (user_id, occurred_on DESC, created_at DESC),
    INDEX ix_tx_user_type_date (user_id, type, occurred_on),
    INDEX ix_tx_category (user_id, category_id, occurred_on),
    INDEX ix_tx_user_sync (user_id, server_updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='流水：金额以"分"为单位存 BIGINT UNSIGNED，避免浮点误差';

-- MySQL 不支持跨三表复合外键（category_id + user_id + type 必须同时在 categories 表里有匹配），
-- 应用层在 INSERT 前校验；categories 已保证 (id, user_id, type) 唯一，
-- 后续可用单独 FK 约束 user_id、category_id 存在：
ALTER TABLE transactions
    ADD CONSTRAINT fk_tx_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_tx_category_parent
        FOREIGN KEY (category_id, user_id) REFERENCES categories(id, user_id);


-- =====================================================================
-- 6. 预算（每账号一份，周期可配置）
-- =====================================================================
CREATE TABLE budgets (
    user_id            CHAR(36)    PRIMARY KEY
    COMMENT 'REFERENCES users(id) ON DELETE CASCADE',
    period_start_day   TINYINT UNSIGNED NOT NULL DEFAULT 1
                       CHECK (period_start_day BETWEEN 1 AND 28)
                       COMMENT '周期起始日 1–28，避开月末不存在 29–31 日的问题',
    total_amount_cents BIGINT UNSIGNED NULL
                       CHECK (total_amount_cents IS NULL
                              OR total_amount_cents BETWEEN 1 AND 999999999),
    created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                       ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='预算配置：每账号一行，NULL 表示未设置总预算';


CREATE TABLE category_budgets (
    id           CHAR(36)    PRIMARY KEY DEFAULT (UUID()),
    user_id      CHAR(36)    NOT NULL,
    category_id  CHAR(36)    NOT NULL,
    amount_cents BIGINT UNSIGNED NOT NULL
                 CHECK (amount_cents BETWEEN 1 AND 999999999),
    created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                 ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX ux_category_budgets (user_id, category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='分类预算：仅用于支出分类，类型由应用层校验';

ALTER TABLE category_budgets
    ADD CONSTRAINT fk_cb_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_cb_category
        FOREIGN KEY (category_id, user_id) REFERENCES categories(id, user_id);


-- =====================================================================
-- 7. 月度收支聚合（与前端 Store.summary 一致）
--    MySQL 8.0 可直接运行下列查询，按自然月分组
-- =====================================================================

-- SELECT
--     DATE_FORMAT(occurred_on, '%Y-%m')                              AS month,
--     SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END)  AS expense_cents,
--     SUM(CASE WHEN type = 'income'  THEN amount_cents ELSE 0 END)  AS income_cents,
--     COUNT(*)                                                      AS tx_count
-- FROM transactions
-- WHERE user_id = ?
--   AND deleted_at IS NULL
--   AND occurred_on >= DATE_FORMAT(?, '%Y-%m-01')
--   AND occurred_on <  DATE_ADD(DATE_FORMAT(?, '%Y-%m-01'), INTERVAL 1 MONTH)
-- GROUP BY 1 ORDER BY 1;

-- 当前预算周期已用（起始日 X，跨月）
-- WITH p AS (
--     SELECT
--         CASE
--             WHEN DAY(CURDATE()) >= period_start_day
--                 THEN DATE_FORMAT(CURDATE(), '%Y-%m-') + LPAD(period_start_day, 2, '0')
--             ELSE DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-')
--                  + LPAD(period_start_day, 2, '0')
--         END AS period_start
--     FROM budgets WHERE user_id = ?
-- )
-- SELECT COALESCE(SUM(t.amount_cents), 0) AS used_cents
-- FROM transactions t CROSS JOIN p
-- WHERE t.user_id = ? AND t.type = 'expense' AND t.deleted_at IS NULL
--   AND t.occurred_on >= p.period_start
--   AND t.occurred_on <  DATE_ADD(p.period_start, INTERVAL 1 MONTH);


-- =====================================================================
-- 8. MariaDB 10.1 防御层：BEFORE INSERT 自动填充 CHAR(36) 主键
--    MySQL 8.0 已有 DEFAULT (UUID())，触发器是兜底
--    （mysql2/node 不支持 DELIMITER，这里直接用 ; 作分隔符）
-- =====================================================================

DROP TRIGGER IF EXISTS trg_users_fill_id;
CREATE TRIGGER trg_users_fill_id BEFORE INSERT ON users
    FOR EACH ROW
    BEGIN
        IF NEW.id IS NULL OR NEW.id = '' THEN
            SET NEW.id = UUID();
        END IF;
    END;

DROP TRIGGER IF EXISTS trg_evc_fill_id;
CREATE TRIGGER trg_evc_fill_id BEFORE INSERT ON email_verification_codes
    FOR EACH ROW
    BEGIN
        IF NEW.id IS NULL OR NEW.id = '' THEN
            SET NEW.id = UUID();
        END IF;
    END;

DROP TRIGGER IF EXISTS trg_sessions_fill_id;
CREATE TRIGGER trg_sessions_fill_id BEFORE INSERT ON sessions
    FOR EACH ROW
    BEGIN
        IF NEW.id IS NULL OR NEW.id = '' THEN
            SET NEW.id = UUID();
        END IF;
    END;

DROP TRIGGER IF EXISTS trg_tx_fill_id;
CREATE TRIGGER trg_tx_fill_id BEFORE INSERT ON transactions
    FOR EACH ROW
    BEGIN
        IF NEW.id IS NULL OR NEW.id = '' THEN
            SET NEW.id = UUID();
        END IF;
    END;

DROP TRIGGER IF EXISTS trg_cb_fill_id;
CREATE TRIGGER trg_cb_fill_id BEFORE INSERT ON category_budgets
    FOR EACH ROW
    BEGIN
        IF NEW.id IS NULL OR NEW.id = '' THEN
            SET NEW.id = UUID();
        END IF;
    END;
