/* ==========================================================================
   budget.js — 预算设置与进度
   可配置周期起始日、总预算与分类预算
   数据来源：后端 /budgets（配置）与 /budgets/progress（进度）
   ========================================================================== */

(function () {
  "use strict";

  if (!UI.requireAuth()) return;
  UI.mountChrome("budget");

  var CIRCUMFERENCE = 2 * Math.PI * 72;

  var els = {
    avatar: document.getElementById("appbarAvatar"),
    period: document.getElementById("budgetPeriod"),
    ring: document.getElementById("ringValue"),
    rate: document.getElementById("ringRate"),
    message: document.getElementById("budgetMessage"),
    metaTotal: document.getElementById("metaTotal"),
    metaUsed: document.getElementById("metaUsed"),
    metaRemain: document.getElementById("metaRemain"),
    banner: document.getElementById("budgetBanner"),
    bannerIcon: document.getElementById("budgetBannerIcon"),
    bannerText: document.getElementById("budgetBannerText"),
    total: document.getElementById("budgetTotal"),
    startDay: document.getElementById("budgetStartDay"),
    categoryList: document.getElementById("categoryBudgets"),
    save: document.getElementById("saveBudget")
  };

  /* ------------------------------ 表单初始化 ------------------------------ */

  (function initForm() {
    var options = [];
    for (var day = 1; day <= 28; day += 1) {
      options.push('<option value="' + day + '">每月 ' + day + " 日</option>");
    }
    els.startDay.innerHTML = options.join("");

    var budget = Store.getBudget();
    els.total.value = budget.total > 0 ? UI.fromCents(budget.total) : "";
    els.startDay.value = String(budget.startDay || 1);
  })();

  /* ------------------------------ 进度渲染 ------------------------------ */

  function renderProgress(usage) {
    var rate = usage.total > 0 ? usage.rate : 0;
    var displayRate = Math.min(Math.max(rate, 0), 100);

    els.period.textContent = "当前周期 " + usage.period.label;

    els.ring.style.strokeDasharray = (displayRate / 100) * CIRCUMFERENCE + " " + CIRCUMFERENCE;
    els.ring.classList.toggle("is-warn", rate >= 80 && rate < 100);
    els.ring.classList.toggle("is-danger", rate >= 100);

    els.rate.textContent = usage.total > 0 ? Math.round(rate) + "%" : "—";

    els.metaTotal.textContent = usage.total > 0 ? UI.formatMoney(usage.total) : "未设置";
    els.metaUsed.textContent = UI.formatMoney(usage.used);
    els.metaRemain.textContent = usage.total > 0 ? UI.formatMoney(usage.remaining) : "—";

    if (!usage.total) {
      els.message.textContent = "设置总预算后，这里会显示本周期已用与剩余。";
      els.banner.hidden = true;
      return;
    }

    if (rate >= 100) {
      els.message.textContent = "本周期预算已用完，超出 " + UI.formatMoney(Math.abs(usage.remaining)) + "。";
      els.banner.hidden = false;
      els.banner.className = "banner banner--danger";
      els.bannerIcon.textContent = "error";
      els.bannerText.textContent = "已超出总预算，可调整预算金额或减少后续支出。超出后仍可继续记录。";
      return;
    }

    if (rate >= 80) {
      els.message.textContent = "已使用 " + Math.round(rate) + "%，剩余 " + UI.formatMoney(usage.remaining) + "。";
      els.banner.hidden = false;
      els.banner.className = "banner banner--warn";
      els.bannerIcon.textContent = "warning";
      els.bannerText.textContent = "预算已使用超过 80%，接下来请留意支出节奏。";
      return;
    }

    els.message.textContent = "预算使用正常，本周期已用 " + Math.round(rate) + "%。";
    els.banner.hidden = false;
    els.banner.className = "banner";
    els.bannerIcon.textContent = "check_circle";
    els.bannerText.textContent = "距离预算上限还有 " + UI.formatMoney(usage.remaining) + "。";
  }

  /* ------------------------------ 分类预算 ------------------------------ */

  function renderCategoryBudgets(usage) {
    var budget = Store.getBudget();
    var usedMap = usage.categoryUsed || {};
    var categories = Store.categories("expense", true);

    els.categoryList.innerHTML = categories
      .map(function (category) {
        var budgetValue = budget.categories[category.id] || 0;
        var used = usedMap[category.id] || 0;
        var rate = budgetValue > 0 ? (used / budgetValue) * 100 : 0;
        var barClass = rate >= 100 ? " is-danger" : rate >= 80 ? " is-warn" : "";

        return (
          '<div class="budget-cat">' +
          '<div class="budget-cat__head">' +
          '<span class="tx-row__icon" style="width:32px;height:32px;border-radius:10px;background:' +
          category.color + '1F;color:' + category.color + '">' + UI.icon(category.icon) + "</span>" +
          '<span class="budget-cat__name">' + UI.escape(category.name) +
          (category.enabled ? "" : ' <span class="badge">已停用</span>') +
          "</span>" +
          '<span class="budget-cat__used">已用 ' + UI.formatMoney(used) + "</span>" +
          '<input class="budget-cat__input" type="number" min="0" step="0.01" inputmode="decimal" ' +
          'data-cat="' + category.id + '" placeholder="不设" value="' +
          (budgetValue > 0 ? UI.fromCents(budgetValue) : "") + '">' +
          "</div>" +
          '<div class="progress"><div class="progress__bar' + barClass + '" style="width:' +
          Math.min(rate, 100) + '%"></div></div>' +
          "</div>"
        );
      })
      .join("");
  }

  /* ------------------------------ 拉取 + 渲染 ------------------------------ */

  function renderAll() {
    Store.budgetProgressAsync()
      .then(function (usage) {
        renderProgress(usage);
        renderCategoryBudgets(usage);
      })
      .catch(function () {
        // 后端失败时回退到本地已同步数据计算
        var usage = Store.budgetUsage();
        if (usage) {
          usage.categoryUsed = {};
          Store.transactions().forEach(function (tx) {
            if (tx.type !== "expense") return;
            if (tx.date < usage.period.start || tx.date > usage.period.end) return;
            usage.categoryUsed[tx.categoryId] = (usage.categoryUsed[tx.categoryId] || 0) + tx.amount;
          });
          renderProgress(usage);
          renderCategoryBudgets(usage);
        }
        UI.toast("预算进度加载失败，显示本地数据", { icon: "error" });
      })
      .finally(function () {
        UI.updateSyncChip();
      });
  }

  /* ------------------------------ 保存 ------------------------------ */

  els.save.addEventListener("click", function () {
    var totalValue = els.total.value.trim();
    var total = totalValue ? Store.toCents(totalValue) : 0;
    var categories = {};

    if (totalValue && isNaN(Number(totalValue))) {
      UI.toast("请输入有效的预算金额", { icon: "error" });
      return;
    }

    var invalid = false;
    els.categoryList.querySelectorAll("[data-cat]").forEach(function (input) {
      var value = input.value.trim();
      if (!value) return;
      if (isNaN(Number(value)) || Number(value) < 0) {
        invalid = true;
        return;
      }
      categories[input.dataset.cat] = Store.toCents(value);
    });

    if (invalid) {
      UI.toast("分类预算需为不小于 0 的数字", { icon: "error" });
      return;
    }

    if (total < 0) {
      UI.toast("预算金额不能为负数", { icon: "error" });
      return;
    }

    els.save.disabled = true;
    Store.saveBudgetAsync({
      total: total,
      startDay: Number(els.startDay.value),
      categories: categories
    })
      .then(function () {
        renderAll();
        UI.toast(total > 0 ? "预算已保存" : "已停用预算提示", { icon: "save" });
      })
      .catch(function (err) {
        UI.toast(err.message || "保存失败", { icon: "error" });
      })
      .finally(function () {
        els.save.disabled = false;
      });
  });

  /* ------------------------------ 初始化 ------------------------------ */

  var user = Store.user();
  if (els.avatar) els.avatar.textContent = UI.avatarLetter(user);

  // 先同步本地分类/预算配置，再拉取后端进度渲染
  Store.syncFromServer()
    .then(function () {
      // 同步后刷新表单里的预算值
      var budget = Store.getBudget();
      els.total.value = budget.total > 0 ? UI.fromCents(budget.total) : "";
      els.startDay.value = String(budget.startDay || 1);
      renderAll();
    })
    .catch(function () {
      renderAll();
    });
})();
