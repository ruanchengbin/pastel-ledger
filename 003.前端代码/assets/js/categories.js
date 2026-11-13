/* ==========================================================================
   categories.js — 分类管理
   支出 / 收入两套分类：新建、改名、配色、排序、停用、删除
   数据来源：后端 /categories（增删改）与 /sync/full（列表同步）
   ========================================================================== */

(function () {
  "use strict";

  if (!UI.requireAuth()) return;
  UI.mountChrome("categories");

  var state = { type: "expense" };

  var els = {
    avatar: document.getElementById("appbarAvatar"),
    tabs: document.getElementById("typeTabs"),
    add: document.getElementById("addCategory"),
    list: document.getElementById("catList")
  };

  /* ------------------------------ 列表 ------------------------------ */

  function rowHTML(category) {
    var usage = Store.categoryUsage(category.id);
    var meta = usage ? "已有 " + usage + " 笔记录" : "暂无记录";

    return (
      '<div class="cat-row' + (category.enabled ? "" : " is-disabled") + '">' +
      '<button class="cat-row__open" type="button" data-edit="' + category.id + '">' +
      '<span class="cat-row__icon" style="background:' + category.color + '1F;color:' + category.color + '">' +
      UI.icon(category.icon) +
      "</span>" +
      '<span class="cat-row__main">' +
      '<span class="cat-row__name">' + UI.escape(category.name) +
      '<span class="badge">' + (category.builtin ? "内置" : "自定义") + "</span>" +
      (category.enabled ? "" : '<span class="badge badge--warn">已停用</span>') +
      "</span>" +
      '<span class="cat-row__meta">' + meta + "</span>" +
      "</span>" +
      "</button>" +
      '<button class="icon-btn cat-row__toggle' + (category.enabled ? "" : " is-off") + '" type="button" ' +
      'data-toggle="' + category.id + '" aria-label="' + (category.enabled ? "停用" : "启用") + " " +
      UI.escape(category.name) + '">' +
      UI.icon(category.enabled ? "toggle_on" : "toggle_off") +
      "</button>" +
      "</div>"
    );
  }

  function renderTabs() {
    els.tabs.querySelectorAll("[data-type]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.type === state.type);
    });
  }

  function renderList() {
    var categories = Store.categories(state.type, true);
    els.list.innerHTML = categories.map(rowHTML).join("");
  }

  function renderAll() {
    renderTabs();
    renderList();
    UI.updateSyncChip();
  }

  /* ------------------------------ 编辑 / 新建 ------------------------------ */

  function colorPickerHTML(selected) {
    return Store.COLORS.map(function (color) {
      return (
        '<button class="color-dot' + (color === selected ? " is-active" : "") + '" type="button" ' +
        'data-color="' + color + '" style="background:' + color + '" aria-label="选择颜色 ' + color + '"></button>'
      );
    }).join("");
  }

  function openEditor(category) {
    var isNew = !category;
    var type = category ? category.type : state.type;
    var selectedColor = category
      ? category.color
      : Store.COLORS[Store.categories(type, true).length % Store.COLORS.length];

    var body =
      '<div class="stack">' +
      '<label class="field"><span class="field__label">分类名称</span>' +
      '<input class="input" id="catName" type="text" maxlength="8" autocomplete="off" ' +
      'placeholder="1–8 个字符" value="' + (category ? UI.escape(category.name) : "") + '"></label>' +
      '<div class="field"><span class="field__label">颜色</span>' +
      '<div class="color-picker" id="colorPicker">' + colorPickerHTML(selectedColor) + "</div></div>" +
      (isNew
        ? '<p class="field__hint">将创建为' + (type === "expense" ? "支出" : "收入") + "分类。</p>"
        : '<div class="row-between"><span class="field__label">排序</span><div class="cluster">' +
          '<button class="btn btn--ghost btn--sm" type="button" data-move="-1">上移</button>' +
          '<button class="btn btn--ghost btn--sm" type="button" data-move="1">下移</button>' +
          "</div></div>" +
          '<p class="field__hint">' +
          (category.builtin ? "内置分类不可删除，可停用。" : "自定义分类在没有流水记录时可删除。") +
          "停用后不会出现在记一笔中，历史记录不受影响。</p>") +
      '<p class="form-error" id="catError"></p>' +
      "</div>";

    var footer =
      (category && !category.builtin
        ? '<button class="btn btn--danger" type="button" data-delete>删除</button>'
        : "") +
      '<button class="btn btn--primary" type="button" data-save>' + (isNew ? "创建分类" : "保存修改") + "</button>";

    UI.modal({
      title: isNew ? "新建" + (type === "expense" ? "支出" : "收入") + "分类" : "编辑分类",
      desc: isNew ? "分类名称在同一类型下不可重复" : "已有 " + Store.categoryUsage(category.id) + " 笔流水记录",
      body: body,
      footer: footer,
      onMount: function (modal) {
        var dialog = modal.dialog;
        var nameInput = dialog.querySelector("#catName");
        var error = dialog.querySelector("#catError");
        var saveBtn = dialog.querySelector("[data-save]");

        function setError(msg) {
          error.textContent = msg || "";
        }

        dialog.querySelectorAll("[data-color]").forEach(function (dot) {
          dot.addEventListener("click", function () {
            selectedColor = dot.dataset.color;
            dialog.querySelectorAll("[data-color]").forEach(function (item) {
              item.classList.toggle("is-active", item === dot);
            });
          });
        });

        dialog.querySelectorAll("[data-move]").forEach(function (button) {
          button.addEventListener("click", async function () {
            button.disabled = true;
            try {
              var moved = await Store.moveCategoryAsync(category.id, Number(button.dataset.move));
              if (!moved) {
                UI.toast(Number(button.dataset.move) < 0 ? "已经在最前面了" : "已经在最后面了", {
                  icon: "info"
                });
                return;
              }
              renderList();
              UI.toast("排序已更新", { icon: "swap_vert" });
            } catch (err) {
              setError(err.message);
            } finally {
              button.disabled = false;
            }
          });
        });

        var deleteButton = dialog.querySelector("[data-delete]");
        if (deleteButton) {
          deleteButton.addEventListener("click", function () {
            UI.confirm({
              title: "删除「" + category.name + "」？",
              desc: "删除后不可恢复。如果已有流水，请改为停用。",
              confirmText: "删除"
            }).then(async function (ok) {
              if (!ok) return;
              deleteButton.disabled = true;
              try {
                await Store.removeCategoryAsync(category.id);
                modal.close();
                renderList();
                UI.toast("分类已删除", { icon: "delete" });
              } catch (err) {
                setError(err.message);
                deleteButton.disabled = false;
              }
            });
          });
        }

        saveBtn.addEventListener("click", async function () {
          var name = nameInput.value.trim();
          if (!name) {
            setError("请输入分类名称");
            nameInput.focus();
            return;
          }
          if (name.length > 8) {
            setError("分类名称最多 8 个字符");
            return;
          }
          saveBtn.disabled = true;
          try {
            if (isNew) {
              await Store.addCategoryAsync({ name: name, type: type, color: selectedColor });
            } else {
              await Store.updateCategoryAsync(category.id, { name: name, color: selectedColor });
            }
            modal.close();
            renderList();
            UI.toast(isNew ? "分类已创建" : "分类已更新", { icon: "check_circle" });
            UI.updateSyncChip();
          } catch (err) {
            setError(err.message);
            saveBtn.disabled = false;
          }
        });

        if (isNew) nameInput.focus();
      }
    });
  }

  /* ------------------------------ 事件 ------------------------------ */

  els.tabs.addEventListener("click", function (event) {
    var button = event.target.closest("[data-type]");
    if (!button) return;
    state.type = button.dataset.type;
    renderAll();
  });

  els.add.addEventListener("click", function () {
    openEditor(null);
  });

  els.list.addEventListener("click", function (event) {
    var toggle = event.target.closest("[data-toggle]");
    if (toggle) {
      var id = toggle.dataset.toggle;
      toggle.disabled = true;
      Store.toggleCategoryAsync(id)
        .then(function (category) {
          renderList();
          UI.toast(
            (category.enabled ? "已启用 " : "已停用 ") + category.name,
            { icon: category.enabled ? "toggle_on" : "toggle_off" }
          );
        })
        .catch(function (err) {
          UI.toast(err.message || "操作失败", { icon: "error" });
          renderList();
        });
      return;
    }

    var edit = event.target.closest("[data-edit]");
    if (edit) {
      var target = Store.categoryById(edit.dataset.edit);
      if (target) openEditor(target);
    }
  });

  /* ------------------------------ 初始化 ------------------------------ */

  var user = Store.user();
  if (els.avatar) els.avatar.textContent = UI.avatarLetter(user);

  // 先同步分类与流水，再渲染列表
  Store.syncFromServer()
    .then(function () {
      renderAll();
    })
    .catch(function () {
      renderAll();
    });
})();
