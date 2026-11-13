/* ==========================================================================
   stats.js — 统计报表
   支持按月 / 按年 / 自定义区间查看收支、结余率、分类构成、环比与趋势
   ========================================================================== */

(function () {
  "use strict";

  if (!UI.requireAuth()) return;
  UI.mountChrome("stats");

  var now = new Date();

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function toISODate(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  var TODAY = toISODate(now);
  var currentMonth = UI.currentMonthKey();
  var currentYear = Number(currentMonth.slice(0, 4));

  // 自定义区间默认最近 30 天
  var defaultEnd = new Date(now.getTime());
  var defaultStart = new Date(now.getTime());
  defaultStart.setDate(defaultStart.getDate() - 29);

  var state = {
    mode: "month", // month | year | custom
    month: currentMonth,
    year: currentYear,
    customStart: toISODate(defaultStart),
    customEnd: toISODate(defaultEnd),
    breakdownType: "expense"
  };

  var els = {
    rangeModes: document.getElementById("rangeModes"),
    rangeText: document.getElementById("rangeText"),
    prev: document.getElementById("prevRange"),
    next: document.getElementById("nextRange"),
    backToCurrent: document.getElementById("backToCurrent"),
    customRange: document.getElementById("customRange"),
    rangeStart: document.getElementById("rangeStart"),
    rangeEnd: document.getElementById("rangeEnd"),
    applyRange: document.getElementById("applyRange"),
    avatar: document.getElementById("appbarAvatar"),
    balance: document.getElementById("statBalance"),
    balanceRate: document.getElementById("statBalanceRate"),
    income: document.getElementById("statIncome"),
    expense: document.getElementById("statExpense"),
    avg: document.getElementById("statAvg"),
    days: document.getElementById("statDays"),
    count: document.getElementById("statCount"),
    incomeMom: document.getElementById("statIncomeMom"),
    expenseMom: document.getElementById("statExpenseMom"),
    breakdownTabs: document.getElementById("breakdownTabs"),
    breakdownList: document.getElementById("breakdownList"),
    momTitle: document.getElementById("momTitle"),
    momHint: document.getElementById("momHint"),
    momExpense: document.getElementById("momExpense"),
    momIncome: document.getElementById("momIncome"),
    momBalance: document.getElementById("momBalance"),
    trendTitle: document.getElementById("trendTitle"),
    trend: document.getElementById("trendChart")
  };

  /* ------------------------------ 区间计算 ------------------------------ */

  function monthRange(key) {
    var parts = key.split("-");
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var lastDay = new Date(y, m, 0).getDate();
    return { start: key + "-01", end: key + "-" + pad2(lastDay) };
  }

  function yearRange(year) {
    return { start: year + "-01-01", end: year + "-12-31" };
  }

  function currentRange() {
    if (state.mode === "month") return monthRange(state.month);
    if (state.mode === "year") return yearRange(state.year);
    return { start: state.customStart, end: state.customEnd };
  }

  // 趋势图区间：按月模式固定看近 6 个月，其余与当前统计区间一致
  function trendRange() {
    if (state.mode === "month") {
      var first = Store.shiftMonth(state.month, -5);
      return { start: first + "-01", end: monthRange(state.month).end };
    }
    return currentRange();
  }

  function rangeLabel() {
    if (state.mode === "month") return UI.monthLabel(state.month);
    if (state.mode === "year") return state.year + " 年";
    return state.customStart + " 至 " + state.customEnd;
  }

  function previousLabel(previous) {
    if (state.mode === "year") return state.year - 1 + " 年";
    if (state.mode === "month") return UI.monthLabel(previous.start.slice(0, 7));
    return previous.start + " 至 " + previous.end;
  }

  /* ------------------------------ 渲染 ------------------------------ */

  function percentText(value) {
    if (value == null) return "—";
    return (value > 0 ? "+" : "") + value.toFixed(1) + "%";
  }

  function setTrendClass(element, value, goodWhenUp) {
    element.classList.remove("amount-income", "text-danger", "subtle");
    if (value == null) {
      element.classList.add("subtle");
      return;
    }
    var good = goodWhenUp ? value >= 0 : value <= 0;
    element.classList.add(good ? "amount-income" : "text-danger");
  }

  function renderModeUI() {
    els.rangeModes.querySelectorAll("[data-mode]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.mode === state.mode);
    });

    els.rangeText.textContent = rangeLabel();
    els.customRange.hidden = state.mode !== "custom";

    if (state.mode === "month") {
      els.prev.disabled = false;
      els.next.disabled = state.month >= currentMonth;
      els.backToCurrent.hidden = state.month === currentMonth;
      els.backToCurrent.textContent = "回到本月";
    } else if (state.mode === "year") {
      els.prev.disabled = false;
      els.next.disabled = state.year >= currentYear;
      els.backToCurrent.hidden = state.year === currentYear;
      els.backToCurrent.textContent = "回到今年";
    } else {
      els.prev.disabled = true;
      els.next.disabled = true;
      els.backToCurrent.hidden = false;
      els.backToCurrent.textContent = "最近 30 天";
    }
  }

  function renderSummary(summary, comparison) {
    if (state.mode === "month") {
      els.momTitle.textContent = "环比上月";
    } else if (state.mode === "year") {
      els.momTitle.textContent = "同比上年";
    } else {
      els.momTitle.textContent = "对比上一周期";
    }

    els.balance.textContent = UI.formatMoney(summary.balance);
    els.balance.classList.toggle("is-negative", summary.balance < 0);
    els.balanceRate.textContent =
      summary.balanceRate == null
        ? "所选区间暂无收入记录"
        : "结余率 " + UI.formatPercent(summary.balanceRate);

    els.income.textContent = UI.formatMoney(summary.income);
    els.expense.textContent = UI.formatMoney(summary.expense);
    els.avg.textContent = UI.formatMoney(summary.dailyAvg);
    els.days.textContent = "按 " + summary.days + " 天计算";
    els.count.textContent = String(summary.count);

    var trendWord = state.mode === "year" ? "同比 " : state.mode === "custom" ? "较上期 " : "环比 ";

    els.incomeMom.textContent = trendWord + percentText(comparison.incomePercent);
    els.expenseMom.textContent = trendWord + percentText(comparison.expensePercent);
    setTrendClass(els.incomeMom, comparison.incomePercent, true);
    setTrendClass(els.expenseMom, comparison.expensePercent, false);

    els.momHint.textContent = "对比 " + previousLabel(comparison.previous);
    els.momExpense.textContent = percentText(comparison.expensePercent);
    els.momIncome.textContent = percentText(comparison.incomePercent);
    els.momBalance.textContent = UI.formatSigned(comparison.balanceDiff);
    setTrendClass(els.momExpense, comparison.expensePercent, false);
    setTrendClass(els.momIncome, comparison.incomePercent, true);
    setTrendClass(els.momBalance, comparison.balanceDiff, true);
  }

  function renderBreakdown(rows) {
    els.breakdownTabs.querySelectorAll("[data-type]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.type === state.breakdownType);
    });

    var label = state.breakdownType === "expense" ? "支出" : "收入";

    if (!rows.length) {
      els.breakdownList.innerHTML = UI.empty({
        icon: state.breakdownType === "expense" ? "pie_chart" : "savings",
        title: "所选区间还没有" + label + "记录",
        desc: "记录后会在这里显示分类占比。",
        action: '<a class="btn btn--soft btn--sm" href="record.html">去记一笔</a>'
      });
      return;
    }

    var range = currentRange();

    els.breakdownList.innerHTML = rows
      .map(function (row) {
        var percent = Math.max(row.percent, 0);
        var inner =
          '<span class="breakdown-row__head">' +
          '<span class="breakdown-row__dot" style="background:' + row.category.color + '"></span>' +
          '<span class="breakdown-row__name">' + UI.escape(row.category.name) + "</span>" +
          '<span class="breakdown-row__amount">' + UI.formatMoney(row.amount) + "</span>" +
          '<span class="breakdown-row__percent">' + percent.toFixed(1) + "%</span>" +
          "</span>" +
          '<span class="breakdown-row__bar"><span style="width:' + Math.min(percent, 100) +
          "%;background:" + row.category.color + '"></span></span>';

        // 仅按月模式可跳转到该月流水；年/自定义区间不提供明细跳转
        if (state.mode === "month") {
          return (
            '<a class="breakdown-row" href="ledger.html?month=' + state.month +
            "&category=" + encodeURIComponent(row.category.id) + '">' + inner + "</a>"
          );
        }
        return '<div class="breakdown-row" data-range="' + range.start + "~" + range.end + '">' + inner + "</div>";
      })
      .join("");
  }

  function renderTrend(months) {
    if (state.mode === "month") {
      els.trendTitle.textContent = "近 6 个月趋势";
    } else if (state.mode === "year") {
      els.trendTitle.textContent = state.year + " 年各月";
    } else {
      els.trendTitle.textContent = "区间月度分布";
    }

    var max = 0;
    months.forEach(function (item) {
      max = Math.max(max, item.expense, item.income);
    });
    if (!max) max = 1;

    els.trend.innerHTML = months
      .map(function (item) {
        var expenseHeight = item.expense ? Math.max(4, Math.round((item.expense / max) * 120)) : 3;
        var incomeHeight = item.income ? Math.max(4, Math.round((item.income / max) * 120)) : 3;
        var active = state.mode === "month" && item.key === state.month;
        return (
          '<button class="trend__col' + (active ? " is-active" : "") +
          '" type="button" data-month="' + item.key + '" title="' +
          UI.escape(UI.monthLabel(item.key) + " 支出 " + UI.formatMoney(item.expense) + " / 收入 " + UI.formatMoney(item.income)) +
          '">' +
          '<span class="trend__bars">' +
          '<span class="trend__bar trend__bar--expense" style="height:' + expenseHeight + 'px"></span>' +
          '<span class="trend__bar trend__bar--income" style="height:' + incomeHeight + 'px"></span>' +
          "</span>" +
          '<span class="trend__label">' + UI.monthShort(item.key) + "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  // 优先取后端统计接口数据；失败时回退到本地已同步数据
  function fetchStats() {
    var range = currentRange();
    var trend = trendRange();
    return Promise.all([
      Store.summaryRangeAsync(range.start, range.end),
      Store.comparisonRangeAsync(range.start, range.end),
      Store.breakdownRangeAsync(range.start, range.end, state.breakdownType),
      Store.trendRangeAsync(trend.start, trend.end)
    ]);
  }

  function renderAll() {
    renderModeUI();

    fetchStats()
      .then(function (results) {
        renderSummary(results[0], results[1]);
        renderBreakdown(results[2]);
        renderTrend(results[3]);
      })
      .catch(function () {
        UI.toast("统计加载失败，显示本地数据", { icon: "error" });
        var range = currentRange();
        var trend = trendRange();
        renderSummary(
          Store.summaryRange(range.start, range.end),
          Store.comparisonRange(range.start, range.end)
        );
        renderBreakdown(Store.breakdownRange(range.start, range.end, state.breakdownType));
        renderTrend(Store.trendRange(trend.start, trend.end));
      })
      .finally(function () {
        UI.updateSyncChip();
      });
  }

  function fetchAndRenderBreakdown() {
    var range = currentRange();
    Store.breakdownRangeAsync(range.start, range.end, state.breakdownType)
      .then(function (rows) {
        renderBreakdown(rows);
      })
      .catch(function () {
        renderBreakdown(Store.breakdownRange(range.start, range.end, state.breakdownType));
      });
  }

  /* ------------------------------ 事件 ------------------------------ */

  els.rangeModes.addEventListener("click", function (event) {
    var button = event.target.closest("[data-mode]");
    if (!button) return;
    var mode = button.dataset.mode;
    if (mode === state.mode) return;
    state.mode = mode;
    if (mode === "custom") {
      els.rangeStart.value = state.customStart;
      els.rangeEnd.value = state.customEnd;
    }
    renderAll();
  });

  els.prev.addEventListener("click", function () {
    if (state.mode === "month") {
      state.month = Store.shiftMonth(state.month, -1);
    } else if (state.mode === "year") {
      state.year -= 1;
    } else {
      return;
    }
    renderAll();
  });

  els.next.addEventListener("click", function () {
    if (state.mode === "month") {
      if (state.month >= currentMonth) return;
      state.month = Store.shiftMonth(state.month, 1);
    } else if (state.mode === "year") {
      if (state.year >= currentYear) return;
      state.year += 1;
    } else {
      return;
    }
    renderAll();
  });

  els.backToCurrent.addEventListener("click", function () {
    if (state.mode === "month") {
      state.month = currentMonth;
    } else if (state.mode === "year") {
      state.year = currentYear;
    } else {
      state.customStart = toISODate(defaultStart);
      state.customEnd = toISODate(defaultEnd);
      els.rangeStart.value = state.customStart;
      els.rangeEnd.value = state.customEnd;
    }
    renderAll();
  });

  els.applyRange.addEventListener("click", function () {
    var start = els.rangeStart.value;
    var end = els.rangeEnd.value;

    if (!start || !end) {
      UI.toast("请选择完整的开始和结束日期", { icon: "error" });
      return;
    }
    if (start > end) {
      UI.toast("开始日期不能晚于结束日期", { icon: "error" });
      return;
    }

    state.customStart = start;
    state.customEnd = end;
    renderAll();
  });

  els.breakdownTabs.addEventListener("click", function (event) {
    var button = event.target.closest("[data-type]");
    if (!button) return;
    state.breakdownType = button.dataset.type;
    fetchAndRenderBreakdown();
  });

  els.trend.addEventListener("click", function (event) {
    var column = event.target.closest("[data-month]");
    if (!column) return;
    var key = column.dataset.month;
    state.mode = "month";
    state.month = key > currentMonth ? currentMonth : key;
    renderAll();
  });

  /* ------------------------------ 初始化 ------------------------------ */

  var user = Store.user();
  if (els.avatar) els.avatar.textContent = UI.avatarLetter(user);

  els.rangeStart.value = state.customStart;
  els.rangeEnd.value = state.customEnd;
  els.rangeStart.max = TODAY;
  els.rangeEnd.max = TODAY;

  renderAll();
})();
