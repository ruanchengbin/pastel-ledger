/* ==========================================================================
   auth.js — 登录 / 注册 / 找回密码
   ========================================================================== */

(function () {
  "use strict";

  var page = document.body.dataset.auth;
  if (!page) return;

  function $(id) {
    return document.getElementById(id);
  }

  var form = $("authForm");
  var errorEl = $("formError");

  // 已登录直接进入账本（找回密码页除外，避免误触）
  if (Store.user() && page !== "forgot") {
    location.replace("ledger.html");
    return;
  }

  function setError(message) {
    if (errorEl) errorEl.textContent = message || "";
  }

  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validPassword(password) {
    return password.length >= 8 && password.length <= 32 && /[A-Za-z]/.test(password) && /\d/.test(password);
  }

  function focusField(id, message) {
    setError(message);
    var field = $(id);
    if (field) {
      field.classList.add("is-invalid");
      field.focus();
      setTimeout(function () {
        field.classList.remove("is-invalid");
      }, 1800);
    }
  }

  // 密码显隐
  document.querySelectorAll("[data-toggle-password]").forEach(function (button) {
    button.addEventListener("click", function () {
      var input = $(button.dataset.togglePassword);
      if (!input) return;
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      var iconEl = button.querySelector(".material-symbols-rounded");
      if (iconEl) iconEl.textContent = show ? "visibility_off" : "visibility";
      button.setAttribute("aria-label", show ? "隐藏密码" : "显示密码");
    });
  });

  // 清除错误
  form.querySelectorAll("input").forEach(function (input) {
    input.addEventListener("input", function () {
      setError("");
    });
  });

  // 验证码
  var codeSent = false;
  var codeTimer = null;
  var sendingCode = false;

  var sendCodeBtn = $("sendCode");
  if (sendCodeBtn) {
    sendCodeBtn.addEventListener("click", function () {
      var email = $("email").value.trim();
      if (!validEmail(email)) {
        focusField("email", "请先输入正确的邮箱地址");
        return;
      }
      if (sendingCode) return;

      sendingCode = true;
      sendCodeBtn.disabled = true;
      sendCodeBtn.textContent = "发送中…";

      Api.sendCode(email, page === "forgot" ? "reset_password" : "register")
        .then(function (data) {
          codeSent = true;
          var hint = $("codeHint");
          if (data && data.delivered === false) {
            if (hint) hint.textContent = "开发模式：验证码已打印在后端控制台";
            UI.toast("验证码已生成，请查看后端控制台", { icon: "terminal" });
          } else {
            if (hint) hint.textContent = "验证码已发送至 " + email + "，10 分钟内有效";
            UI.toast("验证码已发送，请查收邮箱", { icon: "mark_email_read" });
          }

          var left = 60;
          sendCodeBtn.textContent = left + "s 后重发";
          clearInterval(codeTimer);
          codeTimer = setInterval(function () {
            left -= 1;
            if (left <= 0) {
              clearInterval(codeTimer);
              sendCodeBtn.disabled = false;
              sendCodeBtn.textContent = "重新获取";
            } else {
              sendCodeBtn.textContent = left + "s 后重发";
            }
          }, 1000);
        })
        .catch(function (err) {
          setError(err.message);
          sendCodeBtn.disabled = false;
          sendCodeBtn.textContent = "获取验证码";
        })
        .then(function () {
          sendingCode = false;
        });
    });
  }

  // 读取并校验验证码格式（真实校验在服务端）
  function readCode() {
    var code = ($("code") && $("code").value.trim()) || "";
    if (!codeSent) {
      focusField("code", "请先获取邮箱验证码");
      return null;
    }
    if (!/^\d{6}$/.test(code)) {
      focusField("code", "请输入 6 位数字验证码");
      return null;
    }
    return code;
  }

  // 演示账号填充
  var fillDemo = $("fillDemo");
  if (fillDemo) {
    fillDemo.addEventListener("click", function () {
      $("email").value = Store.DEMO_EMAIL;
      $("password").value = Store.DEMO_PASSWORD;
      setError("");
      UI.toast("已填入演示账号，点击登录即可体验", { icon: "auto_fix_high" });
    });
  }

  function redirectAfterLogin() {
    var params = new URLSearchParams(location.search);
    var next = params.get("next");
    if (next && !/^[\w-]+\.html(\?.*)?$/.test(next)) next = null;
    location.replace(next || "ledger.html");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    setError("");

    var email = $("email").value.trim();
    var password = $("password").value;
    var submitBtn = form.querySelector('button[type="submit"]');

    function setBusy(busy) {
      if (!submitBtn) return;
      if (busy) {
        submitBtn.disabled = true;
        submitBtn.dataset.label = submitBtn.textContent;
        submitBtn.textContent = "处理中…";
      } else {
        submitBtn.disabled = false;
        if (submitBtn.dataset.label) submitBtn.textContent = submitBtn.dataset.label;
      }
    }

    if (!validEmail(email)) {
      focusField("email", "请输入正确的邮箱地址");
      return;
    }

    if (page === "login") {
      if (!password) {
        focusField("password", "请输入密码");
        return;
      }
      setBusy(true);
      Store.login(email, password, $("remember") ? $("remember").checked : true)
        .then(function () {
          UI.flash("欢迎回来，账本已同步", { icon: "waving_hand" });
          redirectAfterLogin();
        })
        .catch(function (err) {
          setError(err.message);
          setBusy(false);
        });
      return;
    }

    if (page === "register") {
      var registerCode = readCode();
      if (!registerCode) return;
      if (!validPassword(password)) {
        focusField("password", "密码需为 8–32 位，且包含字母与数字");
        return;
      }
      if (password !== $("confirm").value) {
        focusField("confirm", "两次输入的密码不一致");
        return;
      }
      if (!$("agree").checked) {
        setError("请先勾选同意用户协议与隐私说明");
        return;
      }
      setBusy(true);
      Store.register(email, password, registerCode)
        .then(function () {
          UI.flash("账号已创建，先记录第一笔吧", { icon: "celebration" });
          location.replace("ledger.html");
        })
        .catch(function (err) {
          setError(err.message);
          setBusy(false);
        });
      return;
    }

    if (page === "forgot") {
      var resetCode = readCode();
      if (!resetCode) return;
      if (!validPassword(password)) {
        focusField("password", "密码需为 8–32 位，且包含字母与数字");
        return;
      }
      if (password !== $("confirm").value) {
        focusField("confirm", "两次输入的密码不一致");
        return;
      }
      setBusy(true);
      Store.resetPassword(email, resetCode, password)
        .then(function () {
          UI.flash("密码已重置，请使用新密码登录", { icon: "lock_reset" });
          location.replace("login.html");
        })
        .catch(function (err) {
          setError(err.message);
          setBusy(false);
        });
    }
  });
})();
