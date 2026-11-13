/* ==========================================================================
   record.js — 记一笔 / 编辑记录
   ========================================================================== */

(async function () {
  "use strict";

  if (!UI.requireAuth()) return;
  UI.mountChrome("record");

  // 先与后端同步，保证分类与编辑对象是最新数据；失败时回退到本地缓存
  try {
    await Store.syncFromServer();
  } catch (err) {
    /* 离线或服务异常时继续使用缓存 */
  }

  var params = new URLSearchParams(location.search);
  var editingId = params.get("id");
  var editing = null;

  if (editingId) {
    editing = Store.findTransaction(editingId);
    if (!editing) {
      UI.toast("记录不存在或已删除", { icon: "error" });
      location.replace("ledger.html");
      return;
    }
  }

  var model = {
    type: editing ? editing.type : "expense",
    categoryId: editing ? editing.categoryId : null,
    amount: editing ? UI.fromCents(editing.amount) : "",
    date: editing ? editing.date : Store.todayISO(),
    note: editing ? editing.note || "" : ""
  };

  var initial = {
    type: model.type,
    categoryId: model.categoryId,
    amount: model.amount,
    date: model.date,
    note: model.note
  };

  var els = {
    title: document.getElementById("recordTitle"),
    sub: document.getElementById("recordSub"),
    typeSwitch: document.getElementById("typeSwitch"),
    typeHint: document.getElementById("typeHint"),
    amount: document.getElementById("amountDisplay"),
    clear: document.getElementById("clearAmount"),
    categoryGrid: document.getElementById("categoryGrid"),
    categoryEmpty: document.getElementById("categoryEmpty"),
    selectedLabel: document.getElementById("selectedCatLabel"),
    date: document.getElementById("dateInput"),
    note: document.getElementById("noteInput"),
    noteCount: document.getElementById("noteCount"),
    save: document.getElementById("saveBtn"),
    keepAdding: document.getElementById("keepAdding"),
    delete: document.getElementById("deleteBtn"),
    close: document.getElementById("closeBtn"),
    keypad: document.getElementById("keypad")
  };

  /* ------------------------------ 渲染 ------------------------------ */

  function formatDraft(value) {
    if (!value) return "0.00";
    var parts = value.split(".");
    var integer = parts[0] || "0";
    integer = integer.replace(/^0+(?=\d)/, "");
    var grouped = Number(integer).toLocaleString("en-US");
    if (parts.length > 1) return grouped + "." + parts[1];
    return grouped + (value.charAt(value.length - 1) === "." ? "." : "");
  }

  function renderAmount() {
    els.amount.textContent = formatDraft(model.amount);
    els.amount.classList.toggle("is-placeholder", !model.amount);
  }

  function renderCategories() {
    var categories = Store.categories(model.type);
    var recentId = Store.recentCategory(model.type);

    els.categoryEmpty.hidden = categories.length > 0;
    els.categoryGrid.hidden = categories.length === 0;

    els.categoryGrid.innerHTML = categories
      .map(function (category) {
        var active = category.id === model.categoryId;
        var recent = category.id === recentId;
        return (
          '<button class="category-option' + (active ? " is-active" : "") + '" type="button" data-cat="' + category.id + '">' +
          '<span class="category-option__icon">' + UI.icon(category.icon) +
          (recent ? '<span class="category-option__recent">最近</span>' : "") +
          "</span>" +
          '<span class="category-option__name">' + UI.escape(category.name) + "</span>" +
          "</button>"
        );
      })
      .join("");

    var selected = model.categoryId ? Store.categoryById(model.categoryId) : null;
    els.selectedLabel.textContent = selected ? selected.name : "未选择";
  }

  function renderType() {
    els.typeSwitch.querySelectorAll("[data-type]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.type === model.type);
    });
    els.typeHint.textContent = model.type === "expense" ? "支出" : "收入";
    renderHeader();
  }

  function renderHeader() {
    els.sub.textContent =
      (model.type === "expense" ? "支出" : "收入") + " · " + UI.dateLabel(model.date);
  }

  function canSave() {
    var amount = parseFloat(model.amount);
    return !!model.categoryId && model.amount !== "" && !isNaN(amount) && amount > 0;
  }

  function refreshSaveState() {
    els.save.disabled = !canSave();
  }

  function renderAll() {
    renderType();
    renderAmount();
    renderCategories();
    refreshSaveState();
    els.noteCount.textContent = els.note.value.length + "/50";
  }

  /* ------------------------------ 输入 ------------------------------ */

  function pressKey(key) {
    if (key === ".") {
      if (!model.amount) return;
      if (model.amount.indexOf(".") > -1) return;
      model.amount += ".";
    } else {
      var parts = model.amount.split(".");
      if (parts.length > 1 && parts[1].length >= 2) return;
      if (parts[0].length >= 7) {
        UI.toast("单笔金额不能超过 9,999,999.99", { icon: "error" });
        return;
      }
      if (model.amount === "0") model.amount = key;
      else model.amount += key;
    }
    renderAmount();
    refreshSaveState();
  }

  function backspace() {
    model.amount = model.amount.slice(0, -1);
    renderAmount();
    refreshSaveState();
  }

  /* ------------------------------ 保存 / 删除 ------------------------------ */

  async function save() {
    if (!canSave()) {
      if (!model.amount || parseFloat(model.amount) <= 0) {
        UI.toast("请输入金额", { icon: "error" });
      } else if (!model.categoryId) {
        UI.toast("请选择分类", { icon: "error" });
        els.categoryGrid.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    var payload = {
      type: model.type,
      amount: Store.toCents(model.amount),
      categoryId: model.categoryId,
      date: model.date,
      note: els.note.value.trim()
    };

    var category = Store.categoryById(model.categoryId);

    try {
      if (editingId) {
        await Store.updateTransaction(editingId, payload);
        UI.flash("记录已更新", { icon: "check_circle" });
        location.replace("ledger.html");
        return;
      }

      await Store.addTransaction(payload);

      var message =
        "已记录 " + (payload.type === "expense" ? "支出 " : "收入 ") +
        UI.formatMoney(payload.amount) + " · " + category.name;

      if (els.keepAdding.checked) {
        UI.toast(message, { icon: "check_circle" });
        model.amount = "";
        els.note.value = "";
        initial.amount = "";
        initial.note = "";
        initial.categoryId = model.categoryId;
        initial.date = model.date;
        initial.type = model.type;
        renderAll();
      } else {
        UI.flash(message, { icon: "check_circle" });
        location.replace("ledger.html");
      }
    } catch (err) {
      UI.toast(err.message, { icon: "error" });
    }
  }

  function isDirty() {
    return (
      model.amount !== initial.amount ||
      model.categoryId !== initial.categoryId ||
      model.type !== initial.type ||
      model.date !== initial.date ||
      els.note.value !== initial.note
    );
  }

  function closePage() {
    if (!isDirty()) {
      UI.closeCurrentPage();
      return;
    }
    UI.confirm({
      title: "放弃这笔记录？",
      desc: "已输入的内容不会保存。",
      confirmText: "放弃",
      cancelText: "继续编辑"
    }).then(function (ok) {
      if (ok) UI.closeCurrentPage();
    });
  }

  function removeRecord() {
    if (!editingId) return;
    UI.confirm({
      title: "删除这笔记录？",
      desc: "删除后 5 秒内可在流水页撤销，之后不可恢复。",
      confirmText: "删除"
    }).then(function (ok) {
      if (!ok) return;
      Store.softDelete(editingId)
        .then(function () {
          location.replace("ledger.html?deleted=" + encodeURIComponent(editingId));
        })
        .catch(function (err) {
          UI.toast(err.message, { icon: "error" });
        });
    });
  }

  /* ------------------------------ 事件绑定 ------------------------------ */

  els.typeSwitch.addEventListener("click", function (event) {
    var button = event.target.closest("[data-type]");
    if (!button || button.dataset.type === model.type) return;
    model.type = button.dataset.type;
    model.categoryId = null;
    renderType();
    renderCategories();
    refreshSaveState();
  });

  els.categoryGrid.addEventListener("click", function (event) {
    var button = event.target.closest("[data-cat]");
    if (!button) return;
    model.categoryId = button.dataset.cat;
    renderCategories();
    refreshSaveState();
  });

  els.keypad.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "backspace") backspace();
    else if (button.dataset.key) pressKey(button.dataset.key);
  });

  els.clear.addEventListener("click", function () {
    model.amount = "";
    renderAmount();
    refreshSaveState();
  });

  els.date.max = Store.todayISO();
  els.date.value = model.date;
  els.date.addEventListener("change", function () {
    var value = els.date.value;
    if (!value) return;
    if (value > Store.todayISO()) {
      els.date.value = model.date;
      UI.toast("不能选择未来的日期", { icon: "error" });
      return;
    }
    model.date = value;
    renderHeader();
  });

  els.note.value = model.note;
  els.note.addEventListener("input", function () {
    els.noteCount.textContent = els.note.value.length + "/50";
  });

  els.save.addEventListener("click", save);
  els.close.addEventListener("click", closePage);
  els.delete.addEventListener("click", removeRecord);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePage();
      return;
    }

    var tag = (event.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;

    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      pressKey(event.key);
    } else if (event.key === ".") {
      event.preventDefault();
      pressKey(".");
    } else if (event.key === "Backspace") {
      event.preventDefault();
      backspace();
    } else if (event.key === "Enter") {
      event.preventDefault();
      save();
    }
  });

  /* ------------------------------ 初始化 ------------------------------ */

  if (editingId) {
    els.title.textContent = "编辑记录";
    els.delete.hidden = false;
  }

  renderAll();
})();
