/* ==========================================================================
   ledger.js — 流水页
   月份切换、概览、筛选、搜索、分组列表与分页
   ========================================================================== */

(async function () {
  "use strict";

  if (!UI.requireAuth()) return;
  UI.mountChrome("ledger");

  // 与后端同步流水与分类；失败时回退到本地缓存
  try {
    await Store.syncFromServer();
  } catch (err) {
    /* 离线或服务异常时继续使用缓存 */
  }

  var PAGE_SIZE = 20;
  var currentMonth = UI.currentMonthKey();

  var state = {
    month: currentMonth,
    visible: PAGE_SIZE,
    accountFilter: "__all__",
    filters: {
      type: "all",
      categories: [],
      min: null,
      max: null,
      from: "",
      to: "",
      keyword: ""
    }
  };

  var els = {
    monthText: document.getElementById("monthText"),
    prev: document.getElementById("prevMonth"),
    next: document.getElementById("nextMonth"),
    backToCurrent: document.getElementById("backToCurrent"),
    accountFilter: document.getElementById("accountFilter"),
    accountSelect: document.getElementById("accountSelect"),
    appbarSub: document.getElementById("appbarSub"),
    avatar: document.getElementById("appbarAvatar"),
    balance: document.getElementById("balanceValue"),
    balanceRate: document.getElementById("balanceRate"),
    expense: document.getElementById("expenseValue"),
    income: document.getElementById("incomeValue"),
    avg: document.getElementById("avgValue"),
    budgetMini: document.getElementById("budgetMini"),
    budgetLabel: document.getElementById("budgetMiniLabel"),
    budgetText: document.getElementById("budgetMiniText"),
    budgetBar: document.getElementById("budgetMiniBar"),
    typeFilter: document.getElementById("typeFilter"),
    searchToggle: document.getElementById("searchToggle"),
    filterToggle: document.getElementById("filterToggle"),
    searchBar: document.getElementById("searchBar"),
    searchInput: document.getElementById("searchInput"),
    filterTags: document.getElementById("filterTags"),
    txList: document.getElementById("txList"),
    loadMore: document.getElementById("loadMore")
  };

  /* ------------------------------ URL 参数 ------------------------------ */

  (function readParams() {
    var params = new URLSearchParams(location.search);
    var month = params.get("month");
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      var key = month;
      var today = UI.currentMonthKey();
      state.month = key > today ? today : key;
    }

    var categoryId = params.get("category");
    if (categoryId) {
      var category = Store.categoryById(categoryId);
      if (category) {
        state.filters.categories = [categoryId];
        state.filters.type = category.type;
      }
    }

    var type = params.get("type");
    if (type === "expense" || type === "income") state.filters.type = type;

    var keyword = params.get("q");
    if (keyword) {
      state.filters.keyword = keyword;
      els.searchBar.hidden = false;
      els.searchToggle.classList.add("is-active");
      els.searchInput.value = keyword;
    }
  })();

  /* ------------------------------ 工具 ------------------------------ */

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function monthBounds(monthKey) {
    var parts = monthKey.split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    return {
      min: monthKey + "-01",
      max: monthKey + "-" + pad(Store.daysInMonth(year, month))
    };
  }

  function hasActiveFilters() {
    var f = state.filters;
    return (
      f.type !== "all" ||
      f.categories.length > 0 ||
      f.min != null ||
      f.max != null ||
      !!f.from ||
      !!f.to ||
      !!f.keyword
    );
  }

  function clearFilters() {
    state.filters = {
      type: "all",
      categories: [],
      min: null,
      max: null,
      from: "",
      to: "",
      keyword: ""
    };
    els.searchInput.value = "";
    els.searchBar.hidden = true;
    els.searchToggle.classList.remove("is-active");
    state.visible = PAGE_SIZE;
  }

  function filteredTransactions() {
    var f = state.filters;
    var keyword = f.keyword.toLowerCase();
    var accountFilter = state.accountFilter;

    return Store.transactionsOfMonth(state.month)
      .filter(function (tx) {
        if (accountFilter !== "__all__") {
          if (tx.ownerEmail !== accountFilter) return false;
        }
        if (f.type !== "all" && tx.type !== f.type) return false;
        if (f.categories.length && f.categories.indexOf(tx.categoryId) < 0) return false;
        if (f.min != null && tx.amount < f.min) return false;
        if (f.max != null && tx.amount > f.max) return false;
        if (f.from && tx.date < f.from) return false;
        if (f.to && tx.date > f.to) return false;
        if (keyword && String(tx.note || "").toLowerCase().indexOf(keyword) < 0) return false;
        return true;
      })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.createdAt < b.createdAt ? 1 : -1;
      });
  }

  /* ------------------------------ 概览 ------------------------------ */

  // 基于当前筛选条件（含账户筛选）计算月度汇总
  function calcSummaryFromFiltered() {
    var items = filteredTransactions();
    var expense = 0;
    var income = 0;
    items.forEach(function (tx) {
      if (tx.type === "income") income += tx.amount;
      else expense += tx.amount;
    });
    var balance = income - expense;
    var year = Number(state.month.slice(0, 4));
    var month = Number(state.month.slice(5, 7));
    var daysTotal = new Date(year, month, 0).getDate();
    var now = new Date();
    var isCurrent = now.getFullYear() === year && now.getMonth() + 1 === month;
    var passed = isCurrent ? Math.max(now.getDate(), 1) : daysTotal;
    return {
      expense: expense,
      income: income,
      balance: balance,
      count: items.length,
      dailyAvg: Math.round(expense / passed),
      balanceRate: income > 0 ? (balance / income) * 100 : null,
      days: passed
    };
  }

  function renderSummary() {
    var summary = calcSummaryFromFiltered();
    var isCurrent = state.month === currentMonth;

    els.monthText.textContent = UI.monthLabel(state.month);
    els.next.disabled = state.month >= currentMonth;
    els.backToCurrent.hidden = isCurrent;

    els.balance.textContent = UI.formatMoney(summary.balance);
    els.balance.classList.toggle("is-negative", summary.balance < 0);
    els.balanceRate.textContent =
      summary.balanceRate == null ? "暂无收入" : "结余率 " + UI.formatPercent(summary.balanceRate);
    els.expense.textContent = UI.formatMoney(summary.expense);
    els.income.textContent = UI.formatMoney(summary.income);
    els.avg.textContent = UI.formatMoney(summary.dailyAvg);

    var accountLabel = "";
    var accounts = Store.visibleAccounts();
    if (accounts.length > 1 && state.accountFilter !== "__all__") {
      var picked = accounts.filter(function (a) {
        return String((a && a.email) || "").toLowerCase() === state.accountFilter;
      })[0];
      accountLabel = " · " + ((picked && picked.name) || state.accountFilter);
    } else if (accounts.length > 1 && state.accountFilter === "__all__") {
      accountLabel = " · 全部 " + accounts.length + " 个账户";
    }

    els.appbarSub.textContent =
      "本月 " + summary.count + " 笔记录 · " + UI.formatMoney(summary.balance) + " 结余" + accountLabel;

    renderBudgetMini();
  }

  function renderBudgetMini() {
    var usage = Store.budgetUsage();
    var shouldShow = usage && usage.total > 0 && state.month === currentMonth;
    els.budgetMini.hidden = !shouldShow;
    if (!shouldShow) return;

    var rate = Math.max(usage.rate, 0);
    els.budgetLabel.textContent = "预算已用 " + Math.round(rate) + "%";
    els.budgetText.textContent = UI.formatMoney(usage.used) + " / " + UI.formatMoney(usage.total);
    els.budgetBar.style.width = Math.min(rate, 100) + "%";
    els.budgetBar.classList.toggle("is-warn", rate >= 80 && rate < 100);
    els.budgetBar.classList.toggle("is-danger", rate >= 100);
  }

  /* ------------------------------ 列表 ------------------------------ */

  function dayHeader(date, list) {
    var expense = 0;
    var income = 0;
    list.forEach(function (tx) {
      if (tx.type === "income") income += tx.amount;
      else expense += tx.amount;
    });

    var parsed = UI.parseISO(date);
    var title = parsed.getMonth() + 1 + "月" + parsed.getDate() + "日 " + UI.weekdayLabel(date);
    if (date === Store.todayISO()) title += " · 今天";

    return (
      '<div class="day-group__head">' +
      '<span class="day-group__date">' + UI.escape(title) + "</span>" +
      '<span class="day-group__total num">支出 ' + UI.formatMoney(expense) + " · 收入 " + UI.formatMoney(income) + "</span>" +
      "</div>"
    );
  }

  function transactionRow(tx) {
    var category = Store.categoryById(tx.categoryId);
    // 对方账户的分类 ID 在本地 categories 里找不到，用后端带过来的 fallback 字段
    if (!category && (tx.categoryName || tx.categoryColor)) {
      category = {
        name: tx.categoryName || "未分类",
        icon: tx.categoryIcon || "help",
        color: tx.categoryColor || "#8A849D"
      };
    }
    if (!category) {
      category = { name: "未分类", icon: "help", color: "#8A849D" };
    }
    var sign = tx.type === "income" ? "+" : "-";
    var amountClass = tx.type === "income" ? "amount-income" : "amount-expense";
    var typeText = (tx.type === "income" ? "收入" : "支出") +
      (tx.sync === "pending" ? " · 待同步" : "") +
      (tx.readonly ? " · 对方账户（只读）" : "");

    var ownerLabel = tx.ownerName || tx.ownerEmail || "";
    var ownerTag = (tx.ownerEmail && Store.user() && tx.ownerEmail !== Store.user().email)
      ? '<span class="tx-row__owner">· ' + UI.escape(ownerLabel) + "</span>"
      : "";

    return (
      '<button class="tx-row' +
      (tx.sync === "pending" ? " tx-row--pending" : "") +
      (tx.readonly ? " tx-row--readonly" : "") +
      '" type="button" data-id="' + tx.id + '"' +
      (tx.readonly ? ' data-readonly="1"' : "") + '>' +
      '<span class="tx-row__icon" style="background:' + category.color + '1F;color:' + category.color + '">' +
      UI.icon(category.icon) +
      "</span>" +
      '<span class="tx-row__main">' +
      '<span class="tx-row__title">' + UI.escape(category.name) + ownerTag + "</span>" +
      (tx.note ? '<span class="tx-row__note">' + UI.escape(tx.note) + "</span>" : "") +
      "</span>" +
      '<span class="tx-row__side">' +
      '<span class="tx-row__amount ' + amountClass + '">' + sign + UI.formatMoney(tx.amount) + "</span>" +
      '<span class="tx-row__type">' + typeText + "</span>" +
      "</span>" +
      "</button>"
    );
  }

  function renderList() {
    var list = filteredTransactions();
    var visible = list.slice(0, state.visible);

    if (!list.length) {
      els.txList.innerHTML = "";
      els.loadMore.hidden = true;

      if (hasActiveFilters()) {
        els.txList.innerHTML = UI.empty({
          icon: "search_off",
          title: "没有符合条件的记录",
          desc: "试试更换关键词或减少筛选条件。",
          action: '<button class="btn btn--soft" type="button" data-clear>清除筛选</button>'
        });
      } else {
        els.txList.innerHTML = UI.empty({
          icon: "receipt_long",
          title: "本月还没有记录",
          desc: "记录第一笔收支，月底就能看到完整的结余。",
          action: '<a class="btn btn--primary" href="record.html">记一笔</a>'
        });
      }
      return;
    }

    var groups = [];
    var map = {};
    visible.forEach(function (tx) {
      if (!map[tx.date]) {
        map[tx.date] = [];
        groups.push(tx.date);
      }
      map[tx.date].push(tx);
    });

    els.txList.innerHTML = groups
      .map(function (date) {
        return (
          '<section class="day-group">' +
          dayHeader(date, map[date]) +
          '<div class="tx-list">' + map[date].map(transactionRow).join("") + "</div>" +
          "</section>"
        );
      })
      .join("");

    els.loadMore.hidden = list.length <= state.visible;
    els.loadMore.textContent = "加载更多（剩余 " + Math.max(list.length - state.visible, 0) + " 笔）";
  }

  /* ------------------------------ 筛选标签 ------------------------------ */

  function renderFilterTags() {
    var f = state.filters;
    var tags = [];

    if (f.type !== "all") {
      tags.push(
        '<span class="filter-tag">类型：' + (f.type === "expense" ? "支出" : "收入") +
        '<button type="button" data-remove="type" aria-label="移除类型筛选">' + UI.icon("close") + "</button></span>"
      );
    }

    f.categories.forEach(function (id) {
      var category = Store.categoryById(id);
      if (!category) return;
      tags.push(
        '<span class="filter-tag">分类：' + UI.escape(category.name) +
        '<button type="button" data-remove-cat="' + id + '" aria-label="移除分类筛选">' + UI.icon("close") + "</button></span>"
      );
    });

    if (f.min != null || f.max != null) {
      var text = "金额：";
      if (f.min != null && f.max != null) text += UI.formatMoney(f.min) + "–" + UI.formatMoney(f.max);
      else if (f.min != null) text += "≥ " + UI.formatMoney(f.min);
      else text += "≤ " + UI.formatMoney(f.max);
      tags.push(
        '<span class="filter-tag">' + UI.escape(text) +
        '<button type="button" data-remove="amount" aria-label="移除金额筛选">' + UI.icon("close") + "</button></span>"
      );
    }

    if (f.from || f.to) {
      var range = "日期：";
      range += f.from ? f.from.slice(5).replace("-", "月") + "日" : "不限";
      range += "–";
      range += f.to ? f.to.slice(5).replace("-", "月") + "日" : "不限";
      tags.push(
        '<span class="filter-tag">' + UI.escape(range) +
        '<button type="button" data-remove="date" aria-label="移除日期筛选">' + UI.icon("close") + "</button></span>"
      );
    }

    if (f.keyword) {
      tags.push(
        '<span class="filter-tag">关键词：' + UI.escape(f.keyword) +
        '<button type="button" data-remove="keyword" aria-label="移除关键词">' + UI.icon("close") + "</button></span>"
      );
    }

    els.filterTags.hidden = tags.length === 0;
    els.filterTags.innerHTML = tags.join("");
  }

  /* ------------------------------ 筛选面板 ------------------------------ */

  function openFilterPanel() {
    var categories = Store.categories("expense", true).concat(Store.categories("income", true));
    var selected = state.filters.categories.slice();
    var bounds = monthBounds(state.month);

    var categoryHTML = categories
      .map(function (category) {
        return (
          '<button class="chip' + (selected.indexOf(category.id) > -1 ? " is-active" : "") + '" type="button" data-cat="' + category.id + '">' +
          '<span class="chip__dot" style="background:' + category.color + '"></span>' +
          UI.escape(category.name) +
          "</button>"
        );
      })
      .join("");

    var body =
      '<div class="stack">' +
      '<div class="field"><span class="field__label">分类（可多选）</span><div class="cluster">' + categoryHTML + "</div></div>" +
      '<div class="form-grid form-grid--2">' +
      '<label class="field"><span class="field__label">最小金额（元）</span>' +
      '<input class="input" id="filterMin" type="number" min="0" step="0.01" inputmode="decimal" value="' +
      (state.filters.min != null ? UI.fromCents(state.filters.min) : "") + '" placeholder="不限"></label>' +
      '<label class="field"><span class="field__label">最大金额（元）</span>' +
      '<input class="input" id="filterMax" type="number" min="0" step="0.01" inputmode="decimal" value="' +
      (state.filters.max != null ? UI.fromCents(state.filters.max) : "") + '" placeholder="不限"></label>' +
      "</div>" +
      '<div class="form-grid form-grid--2">' +
      '<label class="field"><span class="field__label">开始日期</span>' +
      '<input class="input" id="filterFrom" type="date" min="' + bounds.min + '" max="' + bounds.max + '" value="' + state.filters.from + '"></label>' +
      '<label class="field"><span class="field__label">结束日期</span>' +
      '<input class="input" id="filterTo" type="date" min="' + bounds.min + '" max="' + bounds.max + '" value="' + state.filters.to + '"></label>' +
      "</div>" +
      '<p class="form-error" id="filterError"></p>' +
      "</div>";

    UI.modal({
      title: "筛选流水",
      desc: UI.monthLabel(state.month) + " · 可组合多个条件",
      body: body,
      footer:
        '<button class="btn btn--ghost" type="button" data-reset>重置</button>' +
        '<button class="btn btn--primary" type="button" data-apply>应用筛选</button>',
      onMount: function (modal) {
        var dialog = modal.dialog;
        var chips = dialog.querySelectorAll("[data-cat]");

        chips.forEach(function (chip) {
          chip.addEventListener("click", function () {
            chip.classList.toggle("is-active");
          });
        });

        dialog.querySelector("[data-reset]").addEventListener("click", function () {
          clearFilters();
          modal.close();
          renderAll();
        });

        dialog.querySelector("[data-apply]").addEventListener("click", function () {
          var error = dialog.querySelector("#filterError");
          var minValue = dialog.querySelector("#filterMin").value;
          var maxValue = dialog.querySelector("#filterMax").value;
          var from = dialog.querySelector("#filterFrom").value;
          var to = dialog.querySelector("#filterTo").value;
          var min = minValue ? Store.toCents(minValue) : null;
          var max = maxValue ? Store.toCents(maxValue) : null;

          if (min != null && max != null && min > max) {
            error.textContent = "最小金额不能大于最大金额";
            return;
          }
          if (from && to && from > to) {
            error.textContent = "开始日期不能晚于结束日期";
            return;
          }

          state.filters.categories = Array.prototype.slice
            .call(dialog.querySelectorAll("[data-cat].is-active"))
            .map(function (chip) {
              return chip.dataset.cat;
            });
          state.filters.min = min;
          state.filters.max = max;
          state.filters.from = from;
          state.filters.to = to;
          state.visible = PAGE_SIZE;

          modal.close();
          renderAll();
        });
      }
    });
  }

  /* ------------------------------ 账户筛选 ------------------------------ */

  function renderAccountFilter() {
    var accounts = Store.visibleAccounts();
    if (!accounts || accounts.length <= 1) {
      els.accountFilter.hidden = true;
      return;
    }
    els.accountFilter.hidden = false;
    var myEmail = Store.user() ? Store.user().email : "";
    var options = ['<option value="__all__">全部关联账户</option>'];
    accounts.forEach(function (acc) {
      var email = String((acc && acc.email) || "").toLowerCase();
      if (!email) return;
      var label;
      if (myEmail && email === myEmail.toLowerCase()) {
        label = (acc.name || email) + "（我）";
      } else {
        label = acc.name ? acc.name + " · " + email : email;
      }
      options.push('<option value="' + email + '">' + UI.escape(label) + "</option>");
    });
    els.accountSelect.innerHTML = options.join("");
    // 确保当前 state 值合法
    if (state.accountFilter !== "__all__") {
      var valid = accounts.some(function (acc) {
        return String((acc && acc.email) || "").toLowerCase() === state.accountFilter;
      });
      if (!valid) state.accountFilter = "__all__";
    }
    els.accountSelect.value = state.accountFilter;
  }

  /* ------------------------------ 渲染 ------------------------------ */

  function renderAll() {
    renderAccountFilter();
    renderSummary();
    renderFilterTags();
    renderList();

    els.typeFilter.querySelectorAll("[data-type]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.type === state.filters.type);
    });

    els.filterToggle.classList.toggle("is-active", hasActiveFilters());
    UI.updateSyncChip();
  }

  /* ------------------------------ 事件 ------------------------------ */

  els.prev.addEventListener("click", function () {
    state.month = Store.shiftMonth(state.month, -1);
    state.visible = PAGE_SIZE;
    renderAll();
  });

  els.next.addEventListener("click", function () {
    if (state.month >= currentMonth) return;
    state.month = Store.shiftMonth(state.month, 1);
    state.visible = PAGE_SIZE;
    renderAll();
  });

  els.backToCurrent.addEventListener("click", function () {
    state.month = currentMonth;
    state.visible = PAGE_SIZE;
    renderAll();
  });

  els.typeFilter.addEventListener("click", function (event) {
    var button = event.target.closest("[data-type]");
    if (!button) return;
    state.filters.type = button.dataset.type;
    state.visible = PAGE_SIZE;
    renderAll();
  });

  els.searchToggle.addEventListener("click", function () {
    var show = els.searchBar.hidden;
    els.searchBar.hidden = !show;
    els.searchToggle.classList.toggle("is-active", show);
    if (show) els.searchInput.focus();
  });

  els.searchInput.addEventListener(
    "input",
    UI.debounce(function () {
      state.filters.keyword = els.searchInput.value.trim();
      state.visible = PAGE_SIZE;
      renderAll();
    }, 200)
  );

  els.filterToggle.addEventListener("click", openFilterPanel);

  els.filterTags.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.remove === "type") state.filters.type = "all";
    else if (button.dataset.remove === "amount") {
      state.filters.min = null;
      state.filters.max = null;
    } else if (button.dataset.remove === "date") {
      state.filters.from = "";
      state.filters.to = "";
    } else if (button.dataset.remove === "keyword") {
      state.filters.keyword = "";
      els.searchInput.value = "";
      els.searchBar.hidden = true;
      els.searchToggle.classList.remove("is-active");
    } else if (button.dataset.removeCat) {
      state.filters.categories = state.filters.categories.filter(function (id) {
        return id !== button.dataset.removeCat;
      });
    }

    state.visible = PAGE_SIZE;
    renderAll();
  });

  els.txList.addEventListener("click", function (event) {
    var clear = event.target.closest("[data-clear]");
    if (clear) {
      clearFilters();
      renderAll();
      return;
    }

    var row = event.target.closest("[data-id]");
    if (!row) return;
    if (row.dataset.readonly === "1") {
      UI.toast("关联账户流水仅可查看，无法编辑", { icon: "visibility" });
      return;
    }
    location.href = "record.html?id=" + encodeURIComponent(row.dataset.id);
  });

  els.accountSelect.addEventListener("change", function () {
    state.accountFilter = els.accountSelect.value;
    state.visible = PAGE_SIZE;
    renderAll();
  });

  els.loadMore.addEventListener("click", function () {
    state.visible += PAGE_SIZE;
    renderList();
  });

  /* ------------------------------ 删除撤销 ------------------------------ */

  (function handleDeleteUndo() {
    var params = new URLSearchParams(location.search);
    var deletedId = params.get("deleted");
    if (!deletedId) return;

    // 清理地址栏，避免刷新后重复提示
    params.delete("deleted");
    var clean = location.pathname + (params.toString() ? "?" + params.toString() : "");
    history.replaceState(null, "", clean);

    UI.toast("记录已删除", {
      icon: "delete",
      duration: 5200,
      action: {
        label: "撤销",
        onClick: function () {
          Store.restore(deletedId)
            .then(function () {
              UI.updateSyncChip();
              renderAll();
              UI.toast("已撤销删除", { icon: "undo" });
            })
            .catch(function (err) {
              UI.toast(err.message, { icon: "error" });
            });
        }
      }
    });

    setTimeout(function () {
      Store.purgeOne(deletedId);
      UI.updateSyncChip();
    }, 5200);
  })();

  /* ------------------------------ 初始化 ------------------------------ */

  // 从浏览器历史（bfcache）恢复页面时（如从「记一笔」返回），重新拉取最新流水
  window.addEventListener("pageshow", function (event) {
    if (!event.persisted) return; // 首次加载已在上方同步过
    Store.syncFromServer()
      .then(function () {
        renderAll();
      })
      .catch(function () {
        /* 离线时继续使用本地缓存 */
      });
  });

  var user = Store.user();
  if (els.avatar) els.avatar.textContent = UI.avatarLetter(user);

  renderAll();
})();
