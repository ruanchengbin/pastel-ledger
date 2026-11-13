/* ==========================================================================
   ui.js — 通用 UI 能力
   应用外壳（侧边栏 / 底部导航）、Toast、确认弹窗、格式化、登录态守卫
   ========================================================================== */

(function (global) {
  "use strict";

  var NAV = [
    { key: "ledger", file: "ledger.html", icon: "receipt_long", label: "流水" },
    { key: "stats", file: "stats.html", icon: "donut_large", label: "统计" },
    { key: "budget", file: "budget.html", icon: "savings", label: "预算" },
    { key: "categories", file: "categories.html", icon: "category", label: "分类" },
    { key: "settings", file: "settings.html", icon: "settings", label: "设置" }
  ];

  var WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  /* ------------------------------ 格式化 ------------------------------ */

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatMoney(cents, options) {
    var opts = options || {};
    var value = Number(cents) || 0;
    var negative = value < 0;
    var amount = Math.abs(value) / 100;

    var text = amount.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    var prefix = "";
    if (negative) prefix = "-";
    else if (opts.sign) prefix = "+";

    return prefix + "¥" + text;
  }

  function formatSigned(cents) {
    return formatMoney(cents, { sign: true });
  }

  function formatPercent(value, digits) {
    if (value == null || isNaN(value)) return "—";
    return value.toFixed(digits == null ? 1 : digits) + "%";
  }

  function fromCents(cents) {
    return ((Number(cents) || 0) / 100).toFixed(2);
  }

  function parseISO(value) {
    var parts = String(value).split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function dateLabel(value) {
    var date = parseISO(value);
    var today = new Date();
    var yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

    if (sameDay(date, today)) return "今天";
    if (sameDay(date, yesterday)) return "昨天";
    if (date.getFullYear() === today.getFullYear()) {
      return date.getMonth() + 1 + "月" + date.getDate() + "日";
    }
    return date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日";
  }

  function weekdayLabel(value) {
    return WEEKDAYS[parseISO(value).getDay()];
  }

  function monthLabel(key) {
    var parts = key.split("-");
    return parts[0] + "年" + Number(parts[1]) + "月";
  }

  function monthShort(key) {
    return Number(key.split("-")[1]) + "月";
  }

  function currentMonthKey() {
    return Store.todayISO().slice(0, 7);
  }

  function icon(name, extraClass) {
    return '<span class="material-symbols-rounded ' + (extraClass || "") + '">' + name + "</span>";
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var context = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(context, args);
      }, wait || 200);
    };
  }

  /* ------------------------------ 登录态守卫 ------------------------------ */

  function requireAuth() {
    if (Store.user()) return true;
    var next = location.pathname.split("/").pop() + location.search;
    location.replace("login.html?next=" + encodeURIComponent(next));
    return false;
  }

  /* ------------------------------ Toast ------------------------------ */

  function toastRegion() {
    var region = document.querySelector(".toast-region");
    if (!region) {
      region = document.createElement("div");
      region.className = "toast-region";
      document.body.appendChild(region);
    }
    return region;
  }

  function toast(message, options) {
    var opts = options || {};
    var region = toastRegion();
    var el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");

    var iconName = opts.icon || "check_circle";
    el.innerHTML = icon(iconName, "toast__icon") + '<div class="toast__text"></div>';
    el.querySelector(".toast__text").textContent = message;

    var timer = null;

    function dismiss() {
      if (!el.parentNode) return;
      clearTimeout(timer);
      el.classList.add("is-leaving");
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 180);
    }

    if (opts.action) {
      var actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "toast__action";
      actionBtn.textContent = opts.action.label;
      actionBtn.addEventListener("click", function () {
        dismiss();
        if (typeof opts.action.onClick === "function") opts.action.onClick();
      });
      el.appendChild(actionBtn);
    }

    region.appendChild(el);
    timer = setTimeout(dismiss, opts.duration || 3600);
    return dismiss;
  }

  /* ------------------------------ 弹窗 ------------------------------ */

  function openModal(options) {
    var opts = options || {};
    var backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML =
      '<div class="modal ' + (opts.size === "sm" ? "modal--sm" : "") + '" role="dialog" aria-modal="true">' +
      '<div class="modal__head">' +
      "<div><h2>" + escapeHTML(opts.title || "") + "</h2>" +
      (opts.desc ? "<p>" + escapeHTML(opts.desc) + "</p>" : "") +
      "</div>" +
      '<button type="button" class="modal-close" data-modal-close aria-label="关闭">' + icon("close") + "</button>" +
      "</div>" +
      '<div class="modal__body">' + (opts.body || "") + "</div>" +
      (opts.footer ? '<div class="modal__foot">' + opts.footer + "</div>" : "") +
      "</div>";

    var previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.appendChild(backdrop);

    function close() {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeydown);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (typeof opts.onClose === "function") opts.onClose();
    }

    function onKeydown(event) {
      if (event.key === "Escape") close();
    }

    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) close();
    });

    backdrop.querySelectorAll("[data-modal-close]").forEach(function (btn) {
      btn.addEventListener("click", close);
    });

    document.addEventListener("keydown", onKeydown);

    var instance = { el: backdrop, dialog: backdrop.querySelector(".modal"), close: close };
    if (typeof opts.onMount === "function") opts.onMount(instance);
    return instance;
  }

  function confirmDialog(options) {
    var opts = options || {};
    return new Promise(function (resolve) {
      var settled = false;

      var instance = openModal({
        title: opts.title || "确认操作",
        desc: opts.desc || "",
        size: "sm",
        body: opts.body || "",
        footer:
          '<button type="button" class="btn btn--ghost" data-cancel>' + escapeHTML(opts.cancelText || "取消") + "</button>" +
          '<button type="button" class="btn ' + (opts.danger === false ? "btn--primary" : "btn--danger") + '" data-confirm>' +
          escapeHTML(opts.confirmText || "确认") + "</button>",
        onMount: function (modal) {
          modal.dialog.querySelector("[data-cancel]").addEventListener("click", function () {
            modal.close();
          });
          modal.dialog.querySelector("[data-confirm]").addEventListener("click", function () {
            settled = true;
            modal.close();
            resolve(true);
          });
        },
        onClose: function () {
          if (!settled) resolve(false);
        }
      });

      return instance;
    });
  }

  /* ------------------------------ 空状态 ------------------------------ */

  function emptyState(options) {
    var opts = options || {};
    return (
      '<div class="empty">' +
      '<div class="empty__icon">' + icon(opts.icon || "inbox") + "</div>" +
      "<h3>" + escapeHTML(opts.title || "暂无数据") + "</h3>" +
      "<p>" + escapeHTML(opts.desc || "") + "</p>" +
      (opts.action || "") +
      "</div>"
    );
  }

  /* ------------------------------ 应用外壳 ------------------------------ */

  function navHTML(active) {
    return NAV.map(function (item) {
      return (
        '<a class="nav-item' + (item.key === active ? " is-active" : "") + '" href="' + item.file + '">' +
        icon(item.icon) +
        "<span>" + item.label + "</span>" +
        "</a>"
      );
    }).join("");
  }

  function tabbarHTML(active) {
    var left = NAV.slice(0, 2).map(function (item) {
      return (
        '<a class="tab-item' + (item.key === active ? " is-active" : "") + '" href="' + item.file + '">' +
        icon(item.icon) +
        "<span>" + item.label + "</span>" +
        "</a>"
      );
    }).join("");

    var right = NAV.slice(2).filter(function (item) {
      return item.key !== "categories";
    }).map(function (item) {
      return (
        '<a class="tab-item' + (item.key === active ? " is-active" : "") + '" href="' + item.file + '">' +
        icon(item.icon) +
        "<span>" + item.label + "</span>" +
        "</a>"
      );
    }).join("");

    return (
      left +
      '<a class="tabbar__add" href="record.html" aria-label="记一笔">' + icon("add") + "</a>" +
      right
    );
  }

  // 支持传入用户对象（优先用名字）或邮箱字符串
  function avatarLetter(input) {
    var name = "";
    if (input && typeof input === "object") {
      name = input.name || String(input.email || "").split("@")[0];
    } else {
      name = String(input || "U").split("@")[0];
    }
    return String(name || "U").slice(0, 1).toUpperCase();
  }

  function mountChrome(active) {
    var user = Store.user();

    var sidebar = document.getElementById("sidebar");
    if (sidebar) {
      sidebar.className = "sidebar";
      sidebar.innerHTML =
        '<a class="sidebar__brand" href="ledger.html">' +
        '<span class="sidebar__logo">' + icon("account_balance_wallet") + "</span>" +
        "<span><strong>轻记账</strong><small>Pastel Ledger</small></span>" +
        "</a>" +
        '<a class="btn btn--primary btn--block" href="record.html">' + icon("add", "btn__icon") + "记一笔</a>" +
        '<nav class="sidebar__nav" aria-label="主导航">' + navHTML(active) + "</nav>" +
        '<div class="sidebar__spacer"></div>' +
        '<div class="sidebar__foot">' +
        '<span class="sync-chip" data-sync-chip hidden></span>' +
        '<a class="user-chip" href="settings.html">' +
        '<span class="user-chip__avatar">' + avatarLetter(user) + "</span>" +
        '<span class="user-chip__meta"><strong>' + escapeHTML((user && (user.name || user.email)) || "未登录") + "</strong><small>查看账号与设置</small></span>" +
        "</a>" +
        "</div>";
    }

    var tabbar = document.getElementById("tabbar");
    if (tabbar) {
      tabbar.className = "tabbar";
      tabbar.setAttribute("aria-label", "底部导航");
      tabbar.innerHTML = tabbarHTML(active);
    }

    bindSync();
    updateSyncChip();
    flushPendingToast();
  }

  /* ------------------------------ 同步状态 ------------------------------ */

  var syncBound = false;

  function bindSync() {
    if (syncBound) return;
    syncBound = true;

    global.addEventListener("online", function () {
      var count = Store.markAllSynced();
      updateSyncChip();
      toast(count ? "网络已恢复，" + count + " 条记录已同步" : "网络已恢复", { icon: "cloud_done" });
    });

    global.addEventListener("offline", function () {
      updateSyncChip();
      toast("当前处于离线状态，记录会先保存到本机", { icon: "cloud_off" });
    });
  }

  function updateSyncChip() {
    var chips = document.querySelectorAll("[data-sync-chip]");
    if (!chips.length) return;

    var pending = Store.pendingCount();
    var offline = global.navigator.onLine === false;
    var label;
    var iconName;
    var warn = false;

    if (offline) {
      label = pending ? "离线 · 待同步 " + pending : "离线";
      iconName = "cloud_off";
      warn = true;
    } else if (pending) {
      label = "待同步 " + pending;
      iconName = "sync";
      warn = true;
    } else {
      label = "已同步";
      iconName = "cloud_done";
    }

    chips.forEach(function (chip) {
      chip.hidden = false;
      chip.className = "sync-chip" + (warn ? " is-offline" : "");
      chip.innerHTML = icon(iconName) + "<span>" + label + "</span>";
    });
  }

  /* ------------------------------ 跨页提示 / 下载 ------------------------------ */

  function flash(message, options) {
    try {
      sessionStorage.setItem(
        "ledger.pendingToast",
        JSON.stringify({ message: message, options: options || {} })
      );
    } catch (err) {
      /* 忽略 */
    }
  }

  function flushPendingToast() {
    var raw = null;
    try {
      raw = sessionStorage.getItem("ledger.pendingToast");
      if (raw) sessionStorage.removeItem("ledger.pendingToast");
    } catch (err) {
      return;
    }
    if (!raw) return;
    try {
      var payload = JSON.parse(raw);
      toast(payload.message, payload.options || {});
    } catch (err) {
      /* 忽略损坏的缓存 */
    }
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1200);
  }

  function closeCurrentPage() {
    if (history.length > 1) history.back();
    else location.href = "ledger.html";
  }

  /* ------------------------------ 对外 API ------------------------------ */

  global.UI = {
    NAV: NAV,
    escape: escapeHTML,
    formatMoney: formatMoney,
    formatSigned: formatSigned,
    formatPercent: formatPercent,
    fromCents: fromCents,
    parseISO: parseISO,
    dateLabel: dateLabel,
    weekdayLabel: weekdayLabel,
    monthLabel: monthLabel,
    monthShort: monthShort,
    currentMonthKey: currentMonthKey,
    icon: icon,
    avatarLetter: avatarLetter,
    debounce: debounce,
    requireAuth: requireAuth,
    toast: toast,
    modal: openModal,
    confirm: confirmDialog,
    empty: emptyState,
    mountChrome: mountChrome,
    updateSyncChip: updateSyncChip,
    flash: flash,
    download: download,
    closeCurrentPage: closeCurrentPage
  };
})(window);
