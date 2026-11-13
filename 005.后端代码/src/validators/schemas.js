const { z } = require("zod");

// ====== Auth ======

const emailSchema = z.string().email({ message: "请输入有效的邮箱地址" }).transform((s) => s.toLowerCase().trim());

const passwordSchema = z
  .string()
  .min(8, { message: "密码至少 8 位" })
  .max(32, { message: "密码不能超过 32 位" })
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), {
    message: "密码需同时包含字母与数字",
  });

const sendCode = z.object({
  email: emailSchema,
  purpose: z.enum(["register", "reset_password"], {
    message: "purpose 只能是 register 或 reset_password",
  }),
});

const register = z.object({
  email: emailSchema,
  password: passwordSchema,
  code: z.string().length(6, { message: "验证码必须是 6 位" }).regex(/^\d{6}$/, { message: "验证码必须全数字" }),
  agree_terms: z.literal(true, { message: "必须同意用户协议" }),
});

const login = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: "请输入密码" }),
  remember: z.boolean().optional().default(true),
});

const refresh = z.object({
  refresh_token: z.string().min(1, { message: "refresh_token 不能为空" }),
});

const resetPassword = z.object({
  email: emailSchema,
  code: z.string().length(6).regex(/^\d{6}$/),
  new_password: passwordSchema,
});

const logout = z.object({
  all: z.boolean().optional().default(false),
});

const changeName = z.object({
  name: z.string().trim().min(1, { message: "请输入名字" }).max(20, { message: "名字不能超过 20 个字" }),
});

const changeTheme = z.object({
  theme: z.enum(["macaron", "ocean", "mint", "apricot"], { message: "主题必须为 macaron/ocean/mint/apricot 之一" }),
});

const changePassword = z.object({
  old_password: z.string().min(1),
  new_password: passwordSchema,
});

const deleteAccount = z.object({
  confirm_text: z.literal("注销", { message: '确认文本必须为"注销"' }),
});

// ====== Transactions ======

// 接受所有 RFC 4122 UUID：版本位 [1-5]，时钟序列高位 [89ab]
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const transactionBase = z.object({
  id: z
    .string()
    .optional()
    .refine((v) => !v || uuidRe.test(v), { message: "id 必须是合法 UUID" }),
  type: z.enum(["expense", "income"], { message: "type 必须是 expense 或 income" }),
  amount: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .refine((v) => v >= 0.01 && v <= 99999999.99, { message: "金额需在 0.01 ~ 99,999,999.99 之间" })
    .refine((v) => Number.isFinite(v), { message: "金额不合法" }),
  category_id: z.string().regex(uuidRe, { message: "category_id 必须是 UUID" }),
  occurred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "occurred_on 格式必须是 YYYY-MM-DD" })
    .refine((s) => {
      const d = new Date(s + "T00:00:00Z");
      return !Number.isNaN(d.getTime()) && new Date().toISOString().slice(0, 10) >= s;
    }, { message: "日期不能晚于今天" }),
  note: z
    .string()
    .max(50, { message: "备注不能超过 50 字" })
    .trim()
    .optional()
    .default(""),
  client_id: z.string().max(64).optional(),
});

const transactionCreate = transactionBase;

const transactionUpdate = z.object({
  type: z.enum(["expense", "income"]).optional(),
  amount: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .refine((v) => v >= 0.01 && v <= 99999999.99, { message: "金额需在 0.01 ~ 99,999,999.99 之间" })
    .optional(),
  category_id: z.string().regex(uuidRe).optional(),
  occurred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => new Date().toISOString().slice(0, 10) >= s, { message: "日期不能晚于今天" })
    .optional(),
  note: z.string().max(50).trim().optional(),
});

const batchTransactions = z.object({
  items: z.array(transactionCreate).min(1).max(100, { message: "一次最多 100 条" }),
});

// ====== Categories ======

const categoryBase = z.object({
  type: z.enum(["expense", "income"]),
  name: z
    .string()
    .trim()
    .refine((s) => s.length >= 1 && s.length <= 8, { message: "分类名称需为 1–8 个字符" }),
  icon: z.string().max(40).optional().default("category"),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, { message: "颜色必须是 #RRGGBB 格式" })
    .optional()
    .default("#7A5FE0"),
});

const categoryUpdate = z.object({
  name: z
    .string()
    .trim()
    .refine((s) => s.length >= 1 && s.length <= 8, { message: "分类名称需为 1–8 个字符" })
    .optional(),
  icon: z.string().max(40).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

const categoryMigrate = z.object({
  target_id: z.string().regex(uuidRe, { message: "target_id 必须是 UUID" }),
});

const categoryOrder = z.object({
  type: z.enum(["expense", "income"]),
  orders: z
    .array(z.object({ id: z.string().regex(uuidRe), sort_order: z.number().int() }))
    .min(1),
});

// ====== Budgets ======

const budgetSave = z.object({
  period_start_day: z
    .number()
    .int()
    .min(1, { message: "周期起始日最小 1" })
    .max(28, { message: "周期起始日最大 28" }),
  total_amount_yuan: z
    .union([z.number(), z.string(), z.null()])
    .transform((v) => (v == null || v === "" ? null : Number(v)))
    .refine((v) => v === null || v === 0 || (v >= 0.01 && v <= 99999999.99), {
      message: "总预算金额不合法",
    })
    .nullable(),
  category_budgets: z
    .array(
      z.object({
        category_id: z.string().regex(uuidRe),
        amount_yuan: z
          .union([z.number(), z.string()])
          .transform((v) => Number(v))
          .refine((v) => v >= 0.01 && v <= 99999999.99),
      })
    )
    .optional()
    .default([]),
});

// ====== Sync ======

const syncPullQuery = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, {
    message: "since 必须是 ISO 时间戳",
  }),
});

const syncPush = z.object({
  device_id: z.string().max(64).optional(),
  transactions: z.array(z.any()).optional().default([]),
  categories: z.array(z.any()).optional().default([]),
});

// ====== Import ======

const restore = z.object({
  confirm_text: z.literal("覆盖", { message: '确认文本必须为"覆盖"' }),
  categories: z.array(z.any()),
  transactions: z.array(z.any()),
  budgets: z.any().optional(),
  category_budgets: z.array(z.any()).optional().default([]),
});

module.exports = {
  sendCode,
  register,
  login,
  refresh,
  resetPassword,
  logout,
  changeName,
  changeTheme,
  changePassword,
  deleteAccount,
  transactionCreate,
  transactionUpdate,
  batchTransactions,
  categoryBase,
  categoryUpdate,
  categoryMigrate,
  categoryOrder,
  budgetSave,
  syncPullQuery,
  syncPush,
  restore,
};
