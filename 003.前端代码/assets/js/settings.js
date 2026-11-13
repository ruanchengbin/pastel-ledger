/* ==========================================================================
   settings.js — 设置
   账户、主题、数据与同步、关于
   数据来源：后端 /account（账户/主题）、/export（导入导出）
   ========================================================================== */

(function () {
  "use strict";

  if (!UI.requireAuth()) return;
  UI.mountChrome("settings");

  var els = {
    avatar: document.getElementById("appbarAvatar"),
    email: document.getElementById("accountEmail"),
    nameInput: document.getElementById("accountName"),
    saveName: document.getElementById("saveNameBtn"),
    memberSince: document.getElementById("accountSince"),
    lastLogin: document.getElementById("lastLogin"),
    themeGroup: document.getElementById("themeGrid"),
    pendingCount: document.getElementById("syncState"),
    syncBtn: document.getElementById("syncNow"),
    exportJson: document.getElementById("exportJson"),
    exportCsv: document.getElementById("exportCsv"),
    importFile: document.getElementById("importFile"),
    importBtn: document.getElementById("importBtn"),
    logout: document.getElementById("logoutBtn"),
    deleteAccount: document.getElementById("deleteAccountBtn")
  };

  /* ------------------------------ 账户 ------------------------------ */

  function renderAccount(user) {
    if (!user) return;
    if (els.avatar) els.avatar.textContent = UI.avatarLetter(user);
    els.email.textContent = user.email;
    if (els.nameInput && document.activeElement !== els.nameInput) {
      els.nameInput.value = user.name || "";
    }
    els.memberSince.textContent = user.createdAt
      ? "注册于 " + user.createdAt.slice(0, 10)
      : "注册时间未知";
    els.lastLogin.textContent = user.lastLoginAt
      ? "最近登录 " + user.lastLoginAt.replace("T", " ").slice(0, 16)
      : "";
  }

  function saveName() {
    var value = (els.nameInput.value || "").trim();
    if (!value) {
      UI.toast("请输入名字", { icon: "error" });
      return;
    }
    els.saveName.disabled = true;
    Store.updateNameAsync(value)
      .then(function (name) {
        renderAccount(Store.user());
        UI.mountChrome("settings");
        UI.toast("名字已保存：" + name, { icon: "badge" });
      })
      .catch(function (err) {
        UI.toast(err.message || "保存名字失败", { icon: "error" });
      })
      .finally(function () {
        els.saveName.disabled = false;
      });
  }

  els.saveName.addEventListener("click", saveName);
  els.nameInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      saveName();
    }
  });

  /* ------------------------------ 主题 ------------------------------ */

  function renderTheme(user) {
    var current = (user && user.theme) || "macaron";
    els.themeGroup.querySelectorAll("[data-theme]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.theme === current);
    });
  }

  /* ------------------------------ 数据 ------------------------------ */

  function renderSync() {
    var pending = Store.pendingCount();
    els.pendingCount.textContent = pending
      ? pending + " 条本地修改尚未同步"
      : "所有数据已与服务器同步";
  }

  /* ------------------------------ 主题切换 ------------------------------ */

  els.themeGroup.addEventListener("click", function (event) {
    var button = event.target.closest("[data-theme]");
    if (!button) return;
    var theme = button.dataset.theme;
    Store.updateThemeAsync(theme)
      .then(function () {
        renderTheme(Store.user());
        UI.toast("主题已保存", { icon: "palette" });
      })
      .catch(function (err) {
        UI.toast(err.message || "保存主题失败", { icon: "error" });
      });
  });

  /* ------------------------------ 同步 ------------------------------ */

  els.syncBtn.addEventListener("click", function () {
    els.syncBtn.disabled = true;
    Store.syncFromServer()
      .then(function () {
        renderSync();
        UI.toast("已同步最新数据", { icon: "sync" });
      })
      .catch(function (err) {
        UI.toast(err.message || "同步失败", { icon: "error" });
      })
      .finally(function () {
        els.syncBtn.disabled = false;
      });
  });

  /* ------------------------------ 导出 ------------------------------ */

  els.exportJson.addEventListener("click", function () {
    els.exportJson.disabled = true;
    Store.exportJSONAsync()
      .then(function () {
        UI.toast("JSON 备份已开始下载", { icon: "download" });
      })
      .catch(function (err) {
        UI.toast(err.message || "导出失败", { icon: "error" });
      })
      .finally(function () {
        els.exportJson.disabled = false;
      });
  });

  els.exportCsv.addEventListener("click", function () {
    els.exportCsv.disabled = true;
    Store.exportCSVAsync()
      .then(function () {
        UI.toast("CSV 账单已开始下载", { icon: "download" });
      })
      .catch(function (err) {
        UI.toast(err.message || "导出失败", { icon: "error" });
      })
      .finally(function () {
        els.exportCsv.disabled = false;
      });
  });

  /* ------------------------------ 导入 / 恢复 ------------------------------ */

  els.importBtn.addEventListener("click", function () {
    var file = els.importFile.files && els.importFile.files[0];
    if (!file) {
      UI.toast("请先选择本地备份文件", { icon: "error" });
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || "");
      var data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        UI.toast("文件内容不是有效的 JSON", { icon: "error" });
        return;
      }

      UI.confirm({
        title: "恢复备份将覆盖当前数据",
        desc: "该操作会用备份文件覆盖云端与本地数据，且无法撤销。是否继续？",
        confirmText: "恢复"
      }).then(function (ok) {
        if (!ok) return;
        els.importBtn.disabled = true;
        Store.restoreAsync(data)
          .then(function () {
            UI.toast("数据已恢复", { icon: "check_circle" });
            renderSync();
          })
          .catch(function (err) {
            UI.toast(err.message || "恢复失败", { icon: "error" });
          })
          .finally(function () {
            els.importBtn.disabled = false;
          });
      });
    };
    reader.onerror = function () {
      UI.toast("读取文件失败", { icon: "error" });
    };
    reader.readAsText(file, "utf-8");
  });

  /* ------------------------------ 登出 / 注销 ------------------------------ */

  els.logout.addEventListener("click", function () {
    UI.confirm({
      title: "退出登录？",
      desc: "本地数据将保留，下次登录可继续使用。",
      confirmText: "退出"
    }).then(function (ok) {
      if (!ok) return;
      Store.logout().then(function () {
        location.replace("login.html");
      });
    });
  });

  els.deleteAccount.addEventListener("click", function () {
    UI.confirm({
      title: "注销账户",
      desc: "注销后将删除账户与所有数据，且无法恢复。",
      confirmText: "注销"
    }).then(function (ok) {
      if (!ok) return;
      Store.deleteAccount().then(function () {
        location.replace("login.html");
      });
    });
  });

  /* ------------------------------ 关联账户 ------------------------------ */

  var linkEls = {
    email: document.getElementById("linkEmail"),
    send: document.getElementById("sendLinkBtn"),
    list: document.getElementById("linkList")
  };

  function linkStatusText(item) {
    if (item.status === "accepted") return item.role === "requester" ? "已关联" : "已关联";
    if (item.status === "pending") return item.role === "requester" ? "等待对方确认" : "待你确认";
    if (item.status === "rejected") return "对方已拒绝";
    if (item.status === "cancelled") return "已取消";
    if (item.status === "revoked") return "已解除";
    return item.status;
  }

  function renderLinks(items) {
    if (!items || !items.length) {
      linkEls.list.innerHTML =
        '<div class="link-empty">还没有任何关联。在上方输入对方邮箱，向其发送关联请求。</div>';
      return;
    }

    linkEls.list.innerHTML = items
      .map(function (item) {
        var partnerHtml =
          '<div class="link-item">' +
          '<span class="link-item__avatar" aria-hidden="true">' +
          UI.avatarLetter(item.partner) + "</span>" +
          '<span class="link-item__main">' +
          '<span class="link-item__email">' + UI.escape(item.partner.name || item.partner.email) + "</span>" +
          '<span class="link-item__status">' +
          (item.partner.name ? UI.escape(item.partner.email) + " · " : "") +
          linkStatusText(item) +
          "</span>" +
          "</span>" +
          '<span class="link-item__actions">' +
          (item.status === "pending" && item.role === "target"
            ? '<button class="btn btn--primary btn--sm" data-link-action="accept" data-link-id="' + item.id + '">接受</button>' +
              '<button class="btn btn--ghost btn--sm" data-link-action="reject" data-link-id="' + item.id + '">拒绝</button>'
            : item.status === "pending" && item.role === "requester"
            ? '<button class="btn btn--ghost btn--sm" data-link-action="cancel" data-link-id="' + item.id + '">取消</button>'
            : item.status === "accepted"
            ? '<button class="btn btn--ghost btn--sm" data-link-action="revoke" data-link-id="' + item.id + '">解除</button>'
            : "") +
          "</span>" +
          "</div>";
        return partnerHtml;
      })
      .join("");
  }

  function loadLinksAndRender() {
    Store.listLinksAsync()
      .then(function (items) {
        renderLinks(items);
      })
      .catch(function (err) {
        linkEls.list.innerHTML = '<div class="link-empty">加载失败：' + UI.escape(err.message || "") + "</div>";
      });
  }

  linkEls.send.addEventListener("click", function () {
    var email = linkEls.email.value.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      UI.toast("请输入有效邮箱", { icon: "error" });
      return;
    }
    linkEls.send.disabled = true;
    Store.requestLinkAsync(email)
      .then(function (items) {
        linkEls.email.value = "";
        renderLinks(items);
        UI.toast("请求已发送", { icon: "send" });
      })
      .catch(function (err) {
        UI.toast(err.message || "发送失败", { icon: "error" });
      })
      .finally(function () {
        linkEls.send.disabled = false;
      });
  });

  linkEls.list.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-link-action]");
    if (!btn) return;
    var action = btn.dataset.linkAction;
    var id = btn.dataset.linkId;
    btn.disabled = true;
    var promise;
    if (action === "accept") promise = Store.acceptLinkAsync(id);
    else if (action === "reject") promise = Store.rejectLinkAsync(id);
    else if (action === "cancel") promise = Store.cancelLinkAsync(id);
    else if (action === "revoke") {
      promise = UI.confirm({
        title: "解除与 " + btn.closest(".link-item").querySelector(".link-item__email").textContent + " 的关联？",
        desc: "解除后双方将不再在流水页看到彼此的账户。",
        confirmText: "解除"
      }).then(function (ok) {
        if (!ok) return null;
        return Store.revokeLinkAsync(id);
      });
    }
    Promise.resolve(promise)
      .then(function (items) {
        if (items) {
          renderLinks(items);
          UI.toast("操作已完成", { icon: "check_circle" });
        }
      })
      .catch(function (err) {
        UI.toast(err.message || "操作失败", { icon: "error" });
        btn.disabled = false;
      });
  });

  /* ------------------------------ 初始化 ------------------------------ */

  // 先从后端刷新账户信息，再渲染
  Store.fetchMeAsync()
    .then(function (user) {
      renderAccount(user);
      renderTheme(user);
    })
    .catch(function () {
      // 后端失败时使用本地缓存
      var user = Store.user();
      renderAccount(user);
      renderTheme(user);
    })
    .finally(function () {
      renderSync();
      UI.updateSyncChip();
      loadLinksAndRender();
    });
})();
