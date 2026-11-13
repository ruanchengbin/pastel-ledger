/* ==========================================================================
   store.js — 本地数据层
   账号、流水、分类、预算、统计口径与导入导出。
   说明：演示版本使用 localStorage 模拟云端同步，数据按账号隔离。
   ========================================================================== */

(function (global) {
  "use strict";

  var AUTH_KEY = "ledger.auth.v1";
  var DATA_PREFIX = "ledger.data.v1:";
  var DEMO_EMAIL = "demo@ledger.app";
  var DEMO_PASSWORD = "demo1234";
  var DELETE_WINDOW = 5000;

  var COLORS = [
    "#7A5FE0",
    "#3E8E7E",
    "#D9845B",
    "#C4557A",
    "#5B7FC7",
    "#9A7B3F",
    "#6B8E4E",
    "#6C6A7C"
  ];

  /* ------------------------------ 工具函数 ------------------------------ */

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function iso(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function parseISO(str) {
    var parts = String(str).split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function todayISO() {
    return iso(new Date());
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function shiftMonth(key, delta) {
    var parts = key.split("-");
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1 + delta, 1);
    return date.getFullYear() + "-" + pad(date.getMonth() + 1);
  }

  function roundCents(value) {
    return Math.round(Number(value) || 0);
  }

  function read(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn("[Store] 本地存储写入失败", err);
      return false;
    }
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  /* ------------------------------ 内置分类 ------------------------------ */

  function builtinCategories() {
    var expense = [
      ["餐饮", "restaurant"],
      ["买菜", "shopping_basket"],
      ["交通", "directions_subway"],
      ["购物", "shopping_bag"],
      ["居住", "home"],
      ["水电", "bolt"],
      ["通讯", "wifi"],
      ["娱乐", "sports_esports"],
      ["医疗", "local_hospital"],
      ["学习", "school"],
      ["人情", "featured_seasonal_and_gifts"],
      ["其他", "category"]
    ];
    var income = [
      ["工资", "payments"],
      ["奖金", "workspace_premium"],
      ["兼职", "work_history"],
      ["理财收益", "trending_up"],
      ["红包", "card_giftcard"],
      ["报销", "receipt_long"],
      ["其他", "add_circle"]
    ];
    var list = [];
    expense.forEach(function (item, index) {
      list.push({
        id: "exp-" + index,
        name: item[0],
        type: "expense",
        icon: item[1],
        color: COLORS[index % COLORS.length],
        builtin: true,
        enabled: true,
        order: index
      });
    });
    income.forEach(function (item, index) {
      list.push({
        id: "inc-" + index,
        name: item[0],
        type: "income",
        icon: item[1],
        color: COLORS[(index + 3) % COLORS.length],
        builtin: true,
        enabled: true,
        order: index
      });
    });
    return list;
  }

  function freshState() {
    return {
      version: 1,
      transactions: [],
      categories: builtinCategories(),
      budget: { total: 0, startDay: 1, categories: {} },
      settings: {
        recent: { expense: null, income: null }
      },
      createdAt: new Date().toISOString()
    };
  }

  /* ------------------------------ 演示数据 ------------------------------ */

  function seedDemo(state) {
    var templates = [
      { type: "income", cat: "工资", amount: 1800000, day: 1, note: "月薪" },
      { type: "expense", cat: "居住", amount: 350000, day: 2, note: "本月房租" },
      { type: "expense", cat: "买菜", amount: 16800, day: 3, note: "周末生鲜采购" },
      { type: "expense", cat: "餐饮", amount: 3250, day: 4, note: "公司楼下午餐" },
      { type: "expense", cat: "交通", amount: 1800, day: 5, note: "地铁通勤" },
      { type: "expense", cat: "餐饮", amount: 4500, day: 6, note: "好友聚餐" },
      { type: "expense", cat: "购物", amount: 25900, day: 7, note: "换季衣物" },
      { type: "expense", cat: "水电", amount: 12800, day: 8, note: "水电燃气" },
      { type: "expense", cat: "餐饮", amount: 2150, day: 9, note: "早餐与咖啡" },
      { type: "expense", cat: "通讯", amount: 9900, day: 10, note: "手机套餐" },
      { type: "expense", cat: "娱乐", amount: 6800, day: 11, note: "电影票" },
      { type: "expense", cat: "学习", amount: 19900, day: 12, note: "技术书籍" },
      { type: "income", cat: "兼职", amount: 120000, day: 14, note: "设计外包尾款" },
      { type: "expense", cat: "医疗", amount: 8600, day: 16, note: "常备药" },
      { type: "expense", cat: "人情", amount: 30000, day: 18, note: "朋友生日礼物" },
      { type: "expense", cat: "餐饮", amount: 5600, day: 20, note: "周末早午餐" },
      { type: "expense", cat: "购物", amount: 12900, day: 22, note: "日用补货" },
      { type: "expense", cat: "交通", amount: 4200, day: 24, note: "打车" },
      { type: "expense", cat: "餐饮", amount: 3800, day: 26, note: "简餐" },
      { type: "expense", cat: "买菜", amount: 9600, day: 28, note: "水果与酸奶" }
    ];

    function categoryId(name, type) {
      var found = state.categories.filter(function (c) {
        return c.type === type && c.name === name;
      })[0];
      return found ? found.id : state.categories[0].id;
    }

    var today = new Date();
    var transactions = [];

    for (var back = 5; back >= 0; back -= 1) {
      var base = new Date(today.getFullYear(), today.getMonth() - back, 1);
      var year = base.getFullYear();
      var month = base.getMonth();
      var total = daysInMonth(year, month + 1);

      templates.forEach(function (tpl, index) {
        var day = Math.min(tpl.day, total);
        if (back === 0 && day > today.getDate()) return;

        var factor = 1 + (((back * 3 + index * 5) % 9) - 4) / 100;
        var amount = Math.round(tpl.amount * factor);
        var created = new Date(year, month, day, 9 + (index % 10), (index * 7) % 60, 0);

        transactions.push({
          id: "tx-" + back + "-" + index,
          type: tpl.type,
          amount: amount,
          categoryId: categoryId(tpl.cat, tpl.type),
          date: year + "-" + pad(month + 1) + "-" + pad(day),
          note: tpl.note,
          createdAt: created.toISOString(),
          updatedAt: created.toISOString(),
          deleted: false,
          deletedAt: null,
          sync: "synced"
        });
      });
    }

    // 今日实时记录，保证首页有内容
    var todayEntries = [
      { cat: "餐饮", amount: 3500, note: "燕麦拿铁与可颂", h: 9, m: 12 },
      { cat: "购物", amount: 12800, note: "家居收纳盒", h: 13, m: 40 },
      { cat: "交通", amount: 500, note: "地铁通勤", h: 8, m: 35 }
    ];
    todayEntries.forEach(function (item, index) {
      var created = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        item.h,
        item.m,
        0
      );
      transactions.push({
        id: "tx-today-" + index,
        type: "expense",
        amount: item.amount,
        categoryId: categoryId(item.cat, "expense"),
        date: todayISO(),
        note: item.note,
        createdAt: created.toISOString(),
        updatedAt: created.toISOString(),
        deleted: false,
        deletedAt: null,
        sync: "synced"
      });
    });

    state.transactions = transactions;
    state.budget = {
      total: 600000,
      startDay: 1,
      categories: {}
    };
    state.budget.categories[categoryId("餐饮", "expense")] = 150000;
    state.budget.categories[categoryId("购物", "expense")] = 120000;
    state.budget.categories[categoryId("交通", "expense")] = 40000;
  }

  /* ------------------------------ 账号 ------------------------------ */

  var USER_KEY = "ledger.user.v1";

  function session() {
    return read(AUTH_KEY, null);
  }

  function currentUser() {
    var u = read(USER_KEY, null);
    if (!u || !u.email) return null;
    return {
      id: u.id || null,
      email: u.email,
      name: u.name || null,
      theme: u.theme || "macaron",
      createdAt: u.createdAt || u.created_at || null,
      lastLoginAt: u.lastLoginAt || u.last_login_at || null
    };
  }

  function saveSession(user) {
    if (!user || !user.email) return;
    var now = new Date().toISOString();
    write(USER_KEY, {
      id: user.id || null,
      email: user.email,
      name: user.name || user.display_name || null,
      theme: user.theme || "macaron",
      createdAt: user.created_at || user.createdAt || now,
      lastLoginAt: user.last_login_at || user.lastLoginAt || now
    });
    write(AUTH_KEY, { email: user.email, at: now });
    cache = null;
    cacheEmail = null;
    applyThemeOf(user);
  }

  // 切换账号时按当前用户保存的外观主题重新应用
  function applyThemeOf(user) {
    var theme = (user && (user.theme || user.theme_key)) || "macaron";
    if (global.Theme && typeof global.Theme.set === "function") {
      global.Theme.set(theme);
    }
    return theme;
  }

  function clearSession() {
    try {
      global.localStorage.removeItem(USER_KEY);
      global.localStorage.removeItem(AUTH_KEY);
    } catch (err) {
      /* 忽略 */
    }
    if (global.Api && global.Api.clearTokens) global.Api.clearTokens();
    cache = null;
    cacheEmail = null;
  }

  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validPassword(password) {
    return password.length >= 8 && password.length <= 32 && /[A-Za-z]/.test(password) && /\d/.test(password);
  }

  function applyAuth(data) {
    if (global.Api && global.Api.setTokens) {
      global.Api.setTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in || 900) * 1000
      });
    }
    saveSession(data.user);
  }

  async function login(email, password, remember) {
    email = String(email || "").trim().toLowerCase();
    assert(validEmail(email), "请输入正确的邮箱地址");
    assert(password, "请输入密码");

    var data = await global.Api.login(email, password, remember !== false);
    applyAuth(data);
    getState(); // 载入该账号的本地账本
    return currentUser();
  }

  async function register(email, password, code) {
    email = String(email || "").trim().toLowerCase();
    assert(validEmail(email), "请输入正确的邮箱地址");
    assert(validPassword(password), "密码需为 8–32 位，且包含字母与数字");
    assert(code, "请输入邮箱验证码");

    var data = await global.Api.register({
      email: email,
      password: password,
      code: code,
      agree_terms: true
    });
    applyAuth(data);
    getState(); // 创建空账本
    return currentUser();
  }

  async function resetPassword(email, code, newPassword) {
    email = String(email || "").trim().toLowerCase();
    assert(validEmail(email), "请输入正确的邮箱地址");
    assert(validPassword(newPassword), "密码需为 8–32 位，且包含字母与数字");
    assert(code, "请输入邮箱验证码");

    await global.Api.resetPassword({ email: email, code: code, new_password: newPassword });
    return true;
  }

  async function logout() {
    try {
      await global.Api.logout();
    } catch (err) {
      /* 网络失败也要清本地登录态 */
    }
    clearSession();
  }

  async function deleteAccount() {
    var user = currentUser();
    if (!user) return false;

    try {
      await global.Api.deleteAccount();
    } catch (err) {
      /* 已注销或网络失败时仍继续清理本地数据 */
    }

    try {
      global.localStorage.removeItem(DATA_PREFIX + user.email);
    } catch (err) {
      /* 忽略 */
    }
    clearSession();
    return true;
  }

  /* ---------------------- 后端账户/导出接口（异步） ---------------------- */

  // 从后端刷新当前用户信息，回写本地会话
  async function fetchMeAsync() {
    var data = await global.Api.me();
    var u = read(USER_KEY, {}) || {};
    u.id = data.id;
    u.email = data.email;
    u.name = data.name || u.name || null;
    u.theme = data.theme || u.theme || "macaron";
    u.createdAt = data.created_at || u.createdAt;
    u.lastLoginAt = data.last_login_at || u.lastLoginAt;
    write(USER_KEY, u);
    applyThemeOf(u);
    return currentUser();
  }

  // 保存主题到后端并应用
  async function updateThemeAsync(theme) {
    var data = await global.Api.updateTheme(theme);
    var u = read(USER_KEY, {}) || {};
    u.theme = data.theme || theme;
    write(USER_KEY, u);
    if (global.Theme && typeof global.Theme.set === "function") {
      global.Theme.set(data.theme || theme);
    }
    return data.theme || theme;
  }

  // 保存名字到后端并回写本地会话
  async function updateNameAsync(name) {
    var data = await global.Api.updateName(name);
    var u = read(USER_KEY, {}) || {};
    u.name = data.name || null;
    write(USER_KEY, u);
    return u.name;
  }

  async function exportJSONAsync() {
    var stamp = new Date().toISOString().slice(0, 10);
    await global.Api.download("/export/json", "ledger-backup-" + stamp + ".json");
  }

  async function exportCSVAsync() {
    var stamp = new Date().toISOString().slice(0, 7);
    await global.Api.download("/export/csv", "ledger-" + stamp + ".csv");
  }

  async function restoreAsync(data) {
    var result = await global.Api.restore(data);
    // 恢复后重新从后端拉取最新数据
    try { await syncFromServer(); } catch (err) { /* 不阻塞恢复结果提示 */ }
    return result;
  }

  /* ------------------------------ 账本状态 ------------------------------ */

  var cache = null;
  var cacheEmail = null;

  function migrate(state) {
    state.transactions = Array.isArray(state.transactions) ? state.transactions : [];
    state.categories = Array.isArray(state.categories) && state.categories.length
      ? state.categories
      : builtinCategories();
    state.budget = state.budget || { total: 0, startDay: 1, categories: {} };
    state.budget.categories = state.budget.categories || {};
    state.settings = state.settings || {};
    state.settings.recent = state.settings.recent || { expense: null, income: null };
    return state;
  }

  function loadData(email) {
    var key = DATA_PREFIX + email;
    var state = read(key, null);

    if (!state) {
      state = freshState();
      if (email === DEMO_EMAIL) seedDemo(state);
      write(key, state);
      return state;
    }

    migrate(state);

    // 清理超过撤销期的软删除记录
    var now = Date.now();
    var before = state.transactions.length;
    state.transactions = state.transactions.filter(function (tx) {
      return !(tx.deleted && tx.deletedAt && now - tx.deletedAt > DELETE_WINDOW);
    });
    if (state.transactions.length !== before) write(key, state);

    return state;
  }

  function getState() {
    var user = currentUser();
    if (!user) return null;
    if (!cache || cacheEmail !== user.email) {
      cache = loadData(user.email);
      cacheEmail = user.email;
    }
    return cache;
  }

  function persist() {
    if (!cache || !cacheEmail) return;
    write(DATA_PREFIX + cacheEmail, cache);
  }

  /* ------------------------------ 金额 / 解析 ------------------------------ */

  function toCents(yuan) {
    return roundCents(Number(yuan) * 100);
  }

  function fromCents(cents) {
    return (roundCents(cents) / 100).toFixed(2);
  }

  /* ------------------------------ 流水 ------------------------------ */

  function activeTransactions() {
    var state = getState();
    if (!state) return [];
    return state.transactions.filter(function (tx) {
      return !tx.deleted;
    });
  }

  function transactionsOfMonth(monthKey) {
    return activeTransactions().filter(function (tx) {
      return tx.date.slice(0, 7) === monthKey;
    });
  }

  function findTransaction(id) {
    return activeTransactions().filter(function (tx) {
      return tx.id === id;
    })[0] || null;
  }

  /* ------------------------------ 服务端同步 ------------------------------ */

  function uuidv4() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function mapCategoryFromApi(row) {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      icon: row.icon || "category",
      color: row.color || "#7a5fe0",
      builtin: !!row.is_system,
      enabled: row.status !== "disabled",
      order: Number(row.sort_order) || 0
    };
  }

  function mapTransactionFromApi(row) {
    return {
      id: row.id,
      type: row.type,
      amount: Math.round(Number(row.amount) * 100),
      categoryId: row.category_id,
      date: String(row.occurred_on).slice(0, 10),
      note: row.note || "",
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.server_updated_at || row.created_at || new Date().toISOString(),
      deleted: !!row.deleted_at,
      deletedAt: row.deleted_at ? Date.parse(row.deleted_at) : null,
      sync: "synced",
      version: row.version,
      ownerEmail: row.owner_email || null,
      ownerName: row.owner_name || null,
      readonly: !!row.readonly,
      categoryName: row.category_name || null,
      categoryIcon: row.category_icon || null,
      categoryColor: row.category_color || null
    };
  }

  function applyServerData(data) {
    var state = getState();
    if (!state || !data) return state;

    if (Array.isArray(data.categories)) {
      state.categories = data.categories.map(mapCategoryFromApi);
    }
    if (Array.isArray(data.transactions)) {
      state.transactions = data.transactions.map(mapTransactionFromApi);
    }
    if (data.budgets) {
      state.budget.startDay = Number(data.budgets.period_start_day) || 1;
      state.budget.total =
        data.budgets.total_amount_yuan == null ? 0 : toCents(data.budgets.total_amount_yuan);
    }
    if (Array.isArray(data.category_budgets)) {
      state.budget.categories = {};
      data.category_budgets.forEach(function (item) {
        state.budget.categories[item.category_id] = toCents(item.amount_yuan);
      });
    }
    if (Array.isArray(data.visible_accounts)) {
      state.visibleAccounts = data.visible_accounts.map(function (a) {
        return { id: a.id, email: a.email, name: a.name || null };
      });
    } else if (!state.visibleAccounts) {
      state.visibleAccounts = currentUser()
        ? [{ id: currentUser().id, email: currentUser().email, name: currentUser().name }]
        : [];
    }
    persist();
    return state;
  }

  async function syncFromServer() {
    if (!currentUser()) return null;
    var data = await global.Api.get("/sync/full?include_partners=1");
    return applyServerData(data);
  }

  async function addTransaction(input) {
    var state = getState();
    if (!state) throw new Error("请先登录");

    var amount = roundCents(input.amount);
    assert(amount > 0, "请输入有效金额");
    assert(amount <= 999999999, "单笔金额不能超过 9,999,999.99");

    var category = state.categories.filter(function (c) {
      return c.id === input.categoryId && c.type === input.type;
    })[0];
    assert(category, "请选择分类");

    var now = new Date().toISOString();
    var type = input.type === "income" ? "income" : "expense";
    var date = input.date || todayISO();
    var note = String(input.note || "").slice(0, 50);
    var id = uuidv4();

    var created = await global.Api.post("/transactions", {
      id: id,
      type: type,
      amount: amount / 100,
      category_id: input.categoryId,
      occurred_on: date,
      note: note
    });

    var transaction = {
      id: (created && created.id) || id,
      type: type,
      amount: amount,
      categoryId: input.categoryId,
      date: date,
      note: note,
      createdAt: now,
      updatedAt: now,
      deleted: false,
      deletedAt: null,
      sync: "synced",
      version: created && created.version
    };

    state.transactions.push(transaction);
    state.settings.recent[type] = transaction.categoryId;
    persist();
    return transaction;
  }

  async function updateTransaction(id, patch) {
    var state = getState();
    if (!state) throw new Error("请先登录");
    var transaction = findTransaction(id);
    assert(transaction, "记录不存在或已删除");

    var body = {};
    if (patch.type) {
      body.type = patch.type === "income" ? "income" : "expense";
      var category = state.categories.filter(function (c) {
        return c.id === patch.categoryId && c.type === body.type;
      })[0];
      assert(category, "请选择分类");
    }
    if (patch.amount != null) {
      var amount = roundCents(patch.amount);
      assert(amount > 0, "请输入有效金额");
      body.amount = amount / 100;
    }
    if (patch.categoryId) body.category_id = patch.categoryId;
    if (patch.date) body.occurred_on = patch.date;
    if (patch.note != null) body.note = String(patch.note).slice(0, 50);

    var updated = await global.Api.put(
      "/transactions/" + encodeURIComponent(id),
      body
    );

    if (body.type) transaction.type = body.type;
    if (patch.amount != null) transaction.amount = roundCents(patch.amount);
    if (patch.categoryId) transaction.categoryId = patch.categoryId;
    if (patch.date) transaction.date = patch.date;
    if (patch.note != null) transaction.note = String(patch.note).slice(0, 50);
    transaction.updatedAt = new Date().toISOString();
    transaction.sync = "synced";
    if (updated && updated.version != null) transaction.version = updated.version;
    state.settings.recent[transaction.type] = transaction.categoryId;
    persist();
    return transaction;
  }

  async function softDelete(id) {
    var transaction = findTransaction(id);
    if (!transaction) return null;
    await global.Api.del("/transactions/" + encodeURIComponent(id));
    transaction.deleted = true;
    transaction.deletedAt = Date.now();
    transaction.sync = "synced";
    persist();
    return transaction;
  }

  async function restore(id) {
    var state = getState();
    if (!state) return null;
    var transaction = state.transactions.filter(function (tx) {
      return tx.id === id;
    })[0];
    if (!transaction) return null;
    await global.Api.post("/transactions/" + encodeURIComponent(id) + "/restore");
    transaction.deleted = false;
    transaction.deletedAt = null;
    transaction.updatedAt = new Date().toISOString();
    transaction.sync = "synced";
    persist();
    return transaction;
  }

  function purgeOne(id) {
    var state = getState();
    if (!state) return;
    state.transactions = state.transactions.filter(function (tx) {
      return !(tx.id === id && tx.deleted);
    });
    persist();
  }

  function pendingCount() {
    var state = getState();
    if (!state) return 0;
    return state.transactions.filter(function (tx) {
      return tx.sync === "pending";
    }).length;
  }

  function markAllSynced() {
    var state = getState();
    if (!state) return 0;
    var count = 0;
    state.transactions.forEach(function (tx) {
      if (tx.sync === "pending") {
        tx.sync = "synced";
        count += 1;
      }
    });
    if (count) persist();
    return count;
  }

  /* ------------------------------ 统计 ------------------------------ */

  function summary(monthKey) {
    var key = monthKey || todayISO().slice(0, 7);
    var list = transactionsOfMonth(key);
    var expense = 0;
    var income = 0;

    list.forEach(function (tx) {
      if (tx.type === "income") income += tx.amount;
      else expense += tx.amount;
    });

    var parts = key.split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var total = daysInMonth(year, month);
    var now = new Date();
    var isCurrent = now.getFullYear() === year && now.getMonth() + 1 === month;
    var passedDays = isCurrent ? Math.max(now.getDate(), 1) : total;
    var balance = income - expense;

    return {
      key: key,
      expense: expense,
      income: income,
      balance: balance,
      count: list.length,
      days: passedDays,
      dailyAvg: expense / passedDays,
      balanceRate: income > 0 ? (balance / income) * 100 : null
    };
  }

  function breakdown(monthKey, type) {
    var list = transactionsOfMonth(monthKey).filter(function (tx) {
      return tx.type === type;
    });
    var total = 0;
    var bucket = {};

    list.forEach(function (tx) {
      total += tx.amount;
      bucket[tx.categoryId] = (bucket[tx.categoryId] || 0) + tx.amount;
    });

    var state = getState();
    var map = {};
    (state ? state.categories : []).forEach(function (c) {
      map[c.id] = c;
    });

    return Object.keys(bucket)
      .map(function (id) {
        var category = map[id] || { id: id, name: "已删除分类", color: "#8A849D", icon: "help" };
        return {
          category: category,
          amount: bucket[id],
          percent: total ? (bucket[id] / total) * 100 : 0
        };
      })
      .sort(function (a, b) {
        return b.amount - a.amount;
      });
  }

  function trend(endMonthKey, count) {
    var size = count || 6;
    var list = [];
    for (var i = size - 1; i >= 0; i -= 1) {
      var key = shiftMonth(endMonthKey, -i);
      var item = summary(key);
      list.push({
        key: key,
        expense: item.expense,
        income: item.income
      });
    }
    return list;
  }

  function comparison(monthKey) {
    var current = summary(monthKey);
    var previous = summary(shiftMonth(monthKey, -1));

    function percent(now, before) {
      if (!before) return null;
      return ((now - before) / before) * 100;
    }

    return {
      current: current,
      previous: previous,
      expensePercent: percent(current.expense, previous.expense),
      incomePercent: percent(current.income, previous.income),
      balanceDiff: current.balance - previous.balance
    };
  }

  /* ---------------------- 统计区间（本地回退） ---------------------- */

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  // 两个日期（含首尾）之间的天数
  function dayDiff(start, end) {
    var a = Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)));
    var b = Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, Number(end.slice(8, 10)));
    return Math.round((b - a) / 86400000) + 1;
  }

  function addDaysISO(dateStr, n) {
    var d = new Date(
      Date.UTC(Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)) - 1, Number(dateStr.slice(8, 10)))
    );
    d.setUTCDate(d.getUTCDate() + n);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }

  function monthStartOf(key) {
    return key + "-01";
  }

  function monthEndOf(key) {
    var parts = key.split("-");
    return key + "-" + pad2(daysInMonth(Number(parts[0]), Number(parts[1])));
  }

  function txInRange(start, end) {
    return activeTransactions().filter(function (tx) {
      return tx.date >= start && tx.date <= end;
    });
  }

  function summaryRange(start, end) {
    var list = txInRange(start, end);
    var expense = 0;
    var income = 0;

    list.forEach(function (tx) {
      if (tx.type === "income") income += tx.amount;
      else expense += tx.amount;
    });

    var balance = income - expense;
    var days = dayDiff(start, end);
    var today = todayISO();
    var passed = today >= start && today <= end ? dayDiff(start, today) : today < start ? 1 : days;

    return {
      key: start.slice(0, 7),
      start: start,
      end: end,
      expense: expense,
      income: income,
      balance: balance,
      count: list.length,
      days: passed,
      dailyAvg: expense / passed,
      balanceRate: income > 0 ? (balance / income) * 100 : null
    };
  }

  function breakdownRange(start, end, type) {
    var list = txInRange(start, end).filter(function (tx) {
      return tx.type === type;
    });
    var total = 0;
    var bucket = {};

    list.forEach(function (tx) {
      total += tx.amount;
      bucket[tx.categoryId] = (bucket[tx.categoryId] || 0) + tx.amount;
    });

    var state = getState();
    var map = {};
    (state ? state.categories : []).forEach(function (c) {
      map[c.id] = c;
    });

    return Object.keys(bucket)
      .map(function (id) {
        var category = map[id] || { id: id, name: "已删除分类", color: "#8A849D", icon: "help" };
        return {
          category: category,
          amount: bucket[id],
          percent: total ? (bucket[id] / total) * 100 : 0
        };
      })
      .sort(function (a, b) {
        return b.amount - a.amount;
      });
  }

  // 按自然月分组，覆盖 start..end 所跨的所有月份
  function trendRange(start, end) {
    var out = [];
    var cur = start.slice(0, 7);
    var last = end.slice(0, 7);

    while (cur <= last) {
      var bStart = monthStartOf(cur) > start ? monthStartOf(cur) : start;
      var bEnd = monthEndOf(cur) < end ? monthEndOf(cur) : end;
      var expense = 0;
      var income = 0;
      txInRange(bStart, bEnd).forEach(function (tx) {
        if (tx.type === "income") income += tx.amount;
        else expense += tx.amount;
      });
      out.push({ key: cur, expense: expense, income: income });
      cur = shiftMonth(cur, 1);
    }
    return out;
  }

  function comparisonRange(start, end) {
    var prevRange;

    if (start.slice(5) === "01-01" && end.slice(5) === "12-31") {
      // 整年对比上一年
      var y = Number(start.slice(0, 4)) - 1;
      prevRange = { start: y + "-01-01", end: y + "-12-31" };
    } else {
      var key = start.slice(0, 7);
      var parts = key.split("-");
      var daysInThisMonth = daysInMonth(Number(parts[0]), Number(parts[1]));
      var isFullMonth = start === key + "-01" && end === key + "-" + pad2(daysInThisMonth);

      if (isFullMonth) {
        var prevKey = shiftMonth(key, -1);
        var prevParts = prevKey.split("-");
        prevRange = {
          start: prevKey + "-01",
          end: prevKey + "-" + pad2(daysInMonth(Number(prevParts[0]), Number(prevParts[1])))
        };
      } else {
        var days = dayDiff(start, end);
        var prevEnd = addDaysISO(start, -1);
        prevRange = { start: addDaysISO(prevEnd, -(days - 1)), end: prevEnd };
      }
    }

    var current = summaryRange(start, end);
    var previous = summaryRange(prevRange.start, prevRange.end);

    function percent(now, before) {
      if (!before) return null;
      return ((now - before) / before) * 100;
    }

    return {
      current: current,
      previous: previous,
      expensePercent: percent(current.expense, previous.expense),
      incomePercent: percent(current.income, previous.income),
      balanceDiff: current.balance - previous.balance
    };
  }

  /* ---------------------- 后端统计接口（异步） ---------------------- */

  function rangeQuery(start, end) {
    return "start=" + encodeURIComponent(start) + "&end=" + encodeURIComponent(end);
  }

  // 将后端 summary 字段（snake_case、元）映射为前端结构（camelCase、分）
  function mapSummaryFromBackend(s) {
    return {
      key: (s.start || "").slice(0, 7),
      start: s.start,
      end: s.end,
      expense: toCents(s.expense_yuan),
      income: toCents(s.income_yuan),
      balance: toCents(s.balance_yuan),
      count: Number(s.transaction_count) || 0,
      days: Number(s.days) || 1,
      dailyAvg: toCents(s.avg_daily_expense),
      balanceRate: s.balance_rate == null ? null : Number(s.balance_rate)
    };
  }

  async function summaryRangeAsync(start, end) {
    var data = await Api.get("/stats/summary?" + rangeQuery(start, end));
    return mapSummaryFromBackend(data);
  }

  async function comparisonRangeAsync(start, end) {
    var data = await Api.get("/stats/comparison?" + rangeQuery(start, end));
    return {
      current: mapSummaryFromBackend(data.current),
      previous: mapSummaryFromBackend(data.previous),
      expensePercent: data.expense_percent == null ? null : Number(data.expense_percent),
      incomePercent: data.income_percent == null ? null : Number(data.income_percent),
      balanceDiff: toCents(data.balance_diff)
    };
  }

  async function breakdownRangeAsync(start, end, type) {
    var data = await Api.get(
      "/stats/breakdown?" + rangeQuery(start, end) + "&type=" + encodeURIComponent(type || "expense")
    );
    return (data || []).map(function (r) {
      return {
        category: {
          id: r.category_id,
          name: r.name,
          color: r.color,
          icon: r.icon
        },
        amount: toCents(r.amount_yuan),
        percent: Number(r.percent) || 0
      };
    });
  }

  async function trendRangeAsync(start, end) {
    var data = await Api.get("/stats/trend?" + rangeQuery(start, end));
    return (data || []).map(function (r) {
      return {
        key: r.month,
        expense: toCents(r.expense_yuan),
        income: toCents(r.income_yuan)
      };
    });
  }

  /* ------------------------------ 分类 ------------------------------ */

  function categoriesOf(type, includeDisabled) {
    var state = getState();
    if (!state) return [];
    return state.categories
      .filter(function (c) {
        return c.type === type && (includeDisabled || c.enabled);
      })
      .sort(function (a, b) {
        return a.order - b.order;
      });
  }

  function categoryById(id) {
    var state = getState();
    if (!state) return null;
    return (
      state.categories.filter(function (c) {
        return c.id === id;
      })[0] || null
    );
  }

  function assertCategoryName(state, name, type, ignoreId) {
    assert(name && name.length <= 8, "分类名称需为 1–8 个字符");
    var duplicated = state.categories.some(function (c) {
      return c.type === type && c.name === name && c.id !== ignoreId;
    });
    assert(!duplicated, "同一类型下已存在同名分类");
  }

  function addCategory(input) {
    var state = getState();
    if (!state) throw new Error("请先登录");
    var name = String(input.name || "").trim();
    var type = input.type === "income" ? "income" : "expense";
    assertCategoryName(state, name, type);

    var maxOrder = state.categories.reduce(function (max, c) {
      return Math.max(max, c.order || 0);
    }, 0);

    var category = {
      id: "cat-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
      name: name,
      type: type,
      icon: input.icon || (type === "income" ? "add_circle" : "sell"),
      color: input.color || COLORS[state.categories.length % COLORS.length],
      builtin: false,
      enabled: true,
      order: maxOrder + 1
    };

    state.categories.push(category);
    persist();
    return category;
  }

  function updateCategory(id, patch) {
    var state = getState();
    if (!state) throw new Error("请先登录");
    var category = categoryById(id);
    assert(category, "分类不存在");

    if (patch.name != null) {
      var name = String(patch.name).trim();
      assertCategoryName(state, name, category.type, id);
      category.name = name;
    }
    if (patch.color) category.color = patch.color;
    if (patch.icon) category.icon = patch.icon;

    persist();
    return category;
  }

  function removeCategory(id) {
    var state = getState();
    if (!state) throw new Error("请先登录");
    var category = categoryById(id);
    assert(category, "分类不存在");
    assert(!category.builtin, "内置分类不可删除，可改为停用");

    var used = activeTransactions().some(function (tx) {
      return tx.categoryId === id;
    });
    assert(!used, "该分类已有流水记录，建议停用而不是删除");

    state.categories = state.categories.filter(function (c) {
      return c.id !== id;
    });
    delete state.budget.categories[id];
    persist();
    return true;
  }

  function toggleCategory(id) {
    var state = getState();
    if (!state) throw new Error("请先登录");
    var category = categoryById(id);
    assert(category, "分类不存在");
    category.enabled = !category.enabled;
    persist();
    return category;
  }

  function moveCategory(id, direction) {
    var category = categoryById(id);
    if (!category) return false;
    var siblings = categoriesOf(category.type, true);
    var index = siblings.findIndex(function (c) {
      return c.id === id;
    });
    var target = index + (direction < 0 ? -1 : 1);
    if (target < 0 || target >= siblings.length) return false;

    var a = siblings[index];
    var b = siblings[target];
    var temp = a.order;
    a.order = b.order;
    b.order = temp;
    persist();
    return true;
  }

  function categoryUsage(id) {
    return activeTransactions().filter(function (tx) {
      return tx.categoryId === id;
    }).length;
  }

  function recentCategory(type) {
    var state = getState();
    if (!state || !state.settings || !state.settings.recent) return null;
    return state.settings.recent[type] || null;
  }

  /* ---------------------- 后端分类接口（异步） ---------------------- */

  async function addCategoryAsync(input) {
    var state = getState();
    if (!state) throw new Error("请先登录");
    var name = String(input.name || "").trim();
    var type = input.type === "income" ? "income" : "expense";
    var color = input.color || "#7A5FE0";
    var icon = input.icon || (type === "income" ? "add_circle" : "sell");

    var created = await global.Api.post("/categories", {
      type: type, name: name, icon: icon, color: color
    });
    var category = mapCategoryFromApi(created);
    state.categories.push(category);
    persist();
    return category;
  }

  async function updateCategoryAsync(id, patch) {
    var state = getState();
    if (!state) throw new Error("请先登录");
    var body = {};
    if (patch.name != null) body.name = String(patch.name).trim();
    if (patch.color) body.color = patch.color;
    if (patch.icon) body.icon = patch.icon;
    if (patch.status) body.status = patch.status;

    var updated = await global.Api.put("/categories/" + encodeURIComponent(id), body);
    var idx = state.categories.findIndex(function (c) { return c.id === id; });
    if (idx >= 0) state.categories[idx] = mapCategoryFromApi(updated);
    persist();
    return mapCategoryFromApi(updated);
  }

  async function removeCategoryAsync(id) {
    var state = getState();
    if (!state) throw new Error("请先登录");
    await global.Api.del("/categories/" + encodeURIComponent(id));
    state.categories = state.categories.filter(function (c) { return c.id !== id; });
    delete state.budget.categories[id];
    persist();
    return true;
  }

  async function toggleCategoryAsync(id) {
    var category = categoryById(id);
    if (!category) throw new Error("分类不存在");
    var status = category.enabled ? "disabled" : "active";
    var updated = await updateCategoryAsync(id, { status: status });
    return updated;
  }

  async function moveCategoryAsync(id, direction) {
    var category = categoryById(id);
    if (!category) return false;
    var siblings = categoriesOf(category.type, true).slice();
    var index = siblings.findIndex(function (c) { return c.id === id; });
    var target = index + (direction < 0 ? -1 : 1);
    if (target < 0 || target >= siblings.length) return false;

    // 交换两元素的顺序
    var a = siblings[index];
    var b = siblings[target];
    var temp = a.order;
    a.order = b.order;
    b.order = temp;

    // 按后端要求提交该类型全部分类的顺序
    var orders = siblings.map(function (c) {
      return { id: c.id, sort_order: c.order };
    });
    await global.Api.put("/categories/order", { type: category.type, orders: orders });
    persist();
    return true;
  }

  /* ------------------------------ 预算 ------------------------------ */

  function budgetPeriod(reference) {
    var state = getState();
    var ref = reference ? new Date(reference) : new Date();
    var startDay = state ? state.budget.startDay || 1 : 1;
    var year = ref.getFullYear();
    var month = ref.getMonth();
    var start;

    if (ref.getDate() >= startDay) {
      start = new Date(year, month, startDay);
    } else {
      start = new Date(year, month - 1, startDay);
    }

    var end = new Date(start.getFullYear(), start.getMonth() + 1, startDay - 1);

    return {
      start: iso(start),
      end: iso(end),
      startDay: startDay,
      startLabel: start.getFullYear() + "年" + (start.getMonth() + 1) + "月" + start.getDate() + "日",
      endLabel: end.getFullYear() + "年" + (end.getMonth() + 1) + "月" + end.getDate() + "日",
      label: start.getMonth() + 1 + "月" + start.getDate() + "日 – " + (end.getMonth() + 1) + "月" + end.getDate() + "日",
      key: iso(start).slice(0, 7)
    };
  }

  function budgetUsage() {
    var state = getState();
    if (!state) return null;

    var period = budgetPeriod();
    var list = activeTransactions().filter(function (tx) {
      return tx.type === "expense" && tx.date >= period.start && tx.date <= period.end;
    });

    var total = roundCents(state.budget.total);
    var used = list.reduce(function (sum, tx) {
      return sum + tx.amount;
    }, 0);

    var categoryRows = state.categories
      .filter(function (c) {
        return c.type === "expense";
      })
      .sort(function (a, b) {
        return a.order - b.order;
      })
      .map(function (category) {
        var budget = roundCents(state.budget.categories[category.id]);
        var catUsed = list
          .filter(function (tx) {
            return tx.categoryId === category.id;
          })
          .reduce(function (sum, tx) {
            return sum + tx.amount;
          }, 0);
        return {
          category: category,
          budget: budget,
          used: catUsed,
          rate: budget > 0 ? (catUsed / budget) * 100 : 0
        };
      })
      .filter(function (row) {
        return row.budget > 0;
      });

    return {
      period: period,
      total: total,
      used: used,
      remaining: total - used,
      rate: total > 0 ? (used / total) * 100 : 0,
      count: list.length,
      categories: categoryRows
    };
  }

  function getBudget() {
    var state = getState();
    if (!state) return null;
    return {
      total: state.budget.total,
      startDay: state.budget.startDay,
      categories: Object.assign({}, state.budget.categories)
    };
  }

  function saveBudget(input) {
    var state = getState();
    if (!state) throw new Error("请先登录");

    var total = roundCents(input.total);
    var startDay = Number(input.startDay) || 1;

    assert(total >= 0, "预算金额不能为负数");
    assert(startDay >= 1 && startDay <= 28, "周期起始日需为 1–28");

    var categories = {};
    Object.keys(input.categories || {}).forEach(function (id) {
      var value = roundCents(input.categories[id]);
      if (value > 0) categories[id] = value;
    });

    state.budget = { total: total, startDay: startDay, categories: categories };
    persist();
    return state.budget;
  }

  /* ---------------------- 后端预算接口（异步） ---------------------- */

  // 将本地预算结构（分）保存到后端 PUT /budgets，并回写本地状态
  async function saveBudgetAsync(input) {
    var state = getState();
    if (!state) throw new Error("请先登录");

    var total = roundCents(input.total);
    var startDay = Number(input.startDay) || 1;
    assert(total >= 0, "预算金额不能为负数");
    assert(startDay >= 1 && startDay <= 28, "周期起始日需为 1–28");

    var categoryBudgets = [];
    Object.keys(input.categories || {}).forEach(function (id) {
      var value = roundCents(input.categories[id]);
      if (value > 0) {
        categoryBudgets.push({ category_id: id, amount_yuan: fromCents(value) });
      }
    });

    var data = await global.Api.put("/budgets", {
      period_start_day: startDay,
      total_amount_yuan: total > 0 ? fromCents(total) : null,
      category_budgets: categoryBudgets
    });

    // 回写本地状态
    state.budget.startDay = Number(data.period_start_day) || 1;
    state.budget.total =
      data.total_amount_yuan == null ? 0 : toCents(data.total_amount_yuan);
    state.budget.categories = {};
    (data.category_budgets || []).forEach(function (item) {
      state.budget.categories[item.category_id] = toCents(item.amount_yuan);
    });
    persist();
    return state.budget;
  }

  // 从后端 GET /budgets/progress 获取预算进度（服务端计算）
  async function budgetProgressAsync(reference) {
    var qs = reference ? "?reference=" + encodeURIComponent(reference) : "";
    var data = await global.Api.get("/budgets/progress" + qs);

    var period = data.period || {};
    var start = period.start || "";
    var end = period.end || "";
    var startParts = start.split("-");
    var endParts = end.split("-");
    var label =
      startParts.length === 3 && endParts.length === 3
        ? Number(startParts[1]) + "月" + Number(startParts[2]) + "日 – " +
          Number(endParts[1]) + "月" + Number(endParts[2]) + "日"
        : "";

    var categoryUsed = {};
    (data.category_breakdown || []).forEach(function (c) {
      categoryUsed[c.category_id] = toCents(c.used_yuan);
    });

    return {
      period: {
        start: start,
        end: end,
        startDay: period.start_day || 1,
        label: label
      },
      total: toCents(data.total_yuan),
      used: toCents(data.used_yuan),
      remaining: toCents(data.remaining_yuan),
      rate: Number(data.consumption_rate) || 0,
      count: Number(data.period_tx_count) || 0,
      categoryUsed: categoryUsed
    };
  }

  /* ------------------------------ 导入 / 导出 ------------------------------ */

  function exportData() {
    var state = getState();
    var user = currentUser();
    if (!state || !user) throw new Error("请先登录");

    return {
      app: "pastel-ledger",
      version: 1,
      exportedAt: new Date().toISOString(),
      account: { email: user.email },
      categories: state.categories,
      transactions: state.transactions.filter(function (tx) {
        return !tx.deleted;
      }),
      budget: state.budget
    };
  }

  function exportJSON() {
    return JSON.stringify(exportData(), null, 2);
  }

  function csvCell(value) {
    var text = String(value == null ? "" : value);
    if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function exportCSV() {
    var data = exportData();
    var state = getState();
    var map = {};
    state.categories.forEach(function (c) {
      map[c.id] = c;
    });

    var rows = [["日期", "类型", "分类", "金额(元)", "备注", "同步状态"]];
    data.transactions
      .slice()
      .sort(function (a, b) {
        return a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date);
      })
      .forEach(function (tx) {
        rows.push([
          tx.date,
          tx.type === "income" ? "收入" : "支出",
          (map[tx.categoryId] || {}).name || "未分类",
          fromCents(tx.amount),
          tx.note || "",
          tx.sync === "pending" ? "待同步" : "已同步"
        ]);
      });

    return "\ufeff" + rows
      .map(function (row) {
        return row.map(csvCell).join(",");
      })
      .join("\r\n");
  }

  function importJSON(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error("文件内容不是有效的 JSON");
    }

    assert(parsed && Array.isArray(parsed.transactions) && Array.isArray(parsed.categories), "备份文件格式不正确，缺少流水或分类数据");

    var state = getState();
    if (!state) throw new Error("请先登录");

    state.categories = parsed.categories;
    state.transactions = parsed.transactions.map(function (tx) {
      return {
        id: tx.id || "tx-" + Math.random().toString(36).slice(2),
        type: tx.type === "income" ? "income" : "expense",
        amount: roundCents(tx.amount),
        categoryId: tx.categoryId,
        date: tx.date,
        note: String(tx.note || "").slice(0, 50),
        createdAt: tx.createdAt || new Date().toISOString(),
        updatedAt: tx.updatedAt || new Date().toISOString(),
        deleted: false,
        deletedAt: null,
        sync: "synced"
      };
    });

    if (parsed.budget) {
      state.budget = {
        total: roundCents(parsed.budget.total),
        startDay: Math.min(Math.max(Number(parsed.budget.startDay) || 1, 1), 28),
        categories: parsed.budget.categories || {}
      };
    }

    persist();
    return true;
  }

  /* ------------------------------ 关联账户 ------------------------------ */

  function visibleAccounts() {
    var state = getState();
    if (!state || !Array.isArray(state.visibleAccounts)) {
      var u = currentUser();
      return u ? [{ id: u.id, email: u.email, name: u.name || null }] : [];
    }
    return state.visibleAccounts.slice();
  }

  async function listLinksAsync() {
    var data = await global.Api.get("/links");
    return data.items || [];
  }

  async function requestLinkAsync(email, message) {
    var data = await global.Api.post("/links", { email: email, message: message || null });
    // 发起请求后拉一次，可能对方也在发 → 直接 accepted
    try { await syncFromServer(); } catch (err) {}
    return data.items || [];
  }

  async function acceptLinkAsync(id) {
    var data = await global.Api.post("/links/" + encodeURIComponent(id) + "/accept");
    try { await syncFromServer(); } catch (err) {}
    return data.items || [];
  }

  async function rejectLinkAsync(id) {
    var data = await global.Api.post("/links/" + encodeURIComponent(id) + "/reject");
    return data.items || [];
  }

  async function cancelLinkAsync(id) {
    var data = await global.Api.post("/links/" + encodeURIComponent(id) + "/cancel");
    return data.items || [];
  }

  async function revokeLinkAsync(id) {
    var data = await global.Api.post("/links/" + encodeURIComponent(id) + "/revoke");
    try { await syncFromServer(); } catch (err) {}
    return data.items || [];
  }

  /* ------------------------------ 对外 API ------------------------------ */

  global.Store = {
    DEMO_EMAIL: DEMO_EMAIL,
    DEMO_PASSWORD: DEMO_PASSWORD,
    COLORS: COLORS,

    // 账号
    user: currentUser,
    login: login,
    register: register,
    resetPassword: resetPassword,
    logout: logout,
    deleteAccount: deleteAccount,
    fetchMeAsync: fetchMeAsync,
    updateNameAsync: updateNameAsync,
    updateThemeAsync: updateThemeAsync,
    exportJSONAsync: exportJSONAsync,
    exportCSVAsync: exportCSVAsync,
    restoreAsync: restoreAsync,

    // 关联账户
    visibleAccounts: visibleAccounts,
    listLinksAsync: listLinksAsync,
    requestLinkAsync: requestLinkAsync,
    acceptLinkAsync: acceptLinkAsync,
    rejectLinkAsync: rejectLinkAsync,
    cancelLinkAsync: cancelLinkAsync,
    revokeLinkAsync: revokeLinkAsync,

    // 基础
    todayISO: todayISO,
    monthKeyOf: function (dateString) {
      return String(dateString).slice(0, 7);
    },
    shiftMonth: shiftMonth,
    daysInMonth: daysInMonth,
    toCents: toCents,
    fromCents: fromCents,

    // 流水
    syncFromServer: syncFromServer,
    transactions: activeTransactions,
    transactionsOfMonth: transactionsOfMonth,
    findTransaction: findTransaction,
    addTransaction: addTransaction,
    updateTransaction: updateTransaction,
    softDelete: softDelete,
    restore: restore,
    purgeOne: purgeOne,
    pendingCount: pendingCount,
    markAllSynced: markAllSynced,

    // 统计
    summary: summary,
    breakdown: breakdown,
    trend: trend,
    comparison: comparison,
    summaryRange: summaryRange,
    breakdownRange: breakdownRange,
    trendRange: trendRange,
    comparisonRange: comparisonRange,
    summaryRangeAsync: summaryRangeAsync,
    comparisonRangeAsync: comparisonRangeAsync,
    breakdownRangeAsync: breakdownRangeAsync,
    trendRangeAsync: trendRangeAsync,

    // 分类
    categories: categoriesOf,
    categoryById: categoryById,
    addCategory: addCategory,
    updateCategory: updateCategory,
    removeCategory: removeCategory,
    toggleCategory: toggleCategory,
    moveCategory: moveCategory,
    addCategoryAsync: addCategoryAsync,
    updateCategoryAsync: updateCategoryAsync,
    removeCategoryAsync: removeCategoryAsync,
    toggleCategoryAsync: toggleCategoryAsync,
    moveCategoryAsync: moveCategoryAsync,
    categoryUsage: categoryUsage,
    recentCategory: recentCategory,

    // 预算
    budgetPeriod: budgetPeriod,
    budgetUsage: budgetUsage,
    getBudget: getBudget,
    saveBudget: saveBudget,
    saveBudgetAsync: saveBudgetAsync,
    budgetProgressAsync: budgetProgressAsync,

    // 备份
    exportJSON: exportJSON,
    exportCSV: exportCSV,
    importJSON: importJSON
  };
})(window);
