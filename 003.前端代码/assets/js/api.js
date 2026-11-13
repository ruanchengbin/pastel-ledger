/* ==========================================================================
   api.js — 后端 REST API 客户端
   统一处理：BaseURL、Token 存取、401 自动刷新、{code,data,message} 解析
   ========================================================================== */

(function (global) {
  "use strict";

  var BASE_URL = "http://127.0.0.1:3000/api/v1";
  var TOKEN_KEY = "ledger.tokens.v1";

  /* ------------------------------ Token ------------------------------ */

  function readTokens() {
    try {
      var raw = global.localStorage.getItem(TOKEN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeTokens(tokens) {
    try {
      if (!tokens) global.localStorage.removeItem(TOKEN_KEY);
      else global.localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
    } catch (err) {
      /* 忽略存储异常 */
    }
  }

  /* ------------------------------ 错误 ------------------------------ */

  function apiError(message, code, status) {
    var err = new Error(message);
    err.code = code;
    err.status = status;
    err.isApiError = true;
    return err;
  }

  /* ------------------------------ 请求 ------------------------------ */

  async function tryRefresh(refreshToken) {
    try {
      var res = await fetch(BASE_URL + "/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      var payload = null;
      try {
        payload = await res.json();
      } catch (err) {
        payload = null;
      }
      if (!res.ok || !payload || payload.code !== 0 || !payload.data) {
        writeTokens(null);
        return false;
      }
      var prev = readTokens() || {};
      writeTokens({
        access_token: payload.data.access_token,
        refresh_token: prev.refresh_token,
        expires_at: Date.now() + (payload.data.expires_in || 900) * 1000
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  async function send(method, path, body, useAuth, retried) {
    var headers = { "Content-Type": "application/json" };
    var tokens = readTokens();
    if (useAuth && tokens && tokens.access_token) {
      headers.Authorization = "Bearer " + tokens.access_token;
    }

    var options = { method: method, headers: headers };
    if (body !== undefined && body !== null) options.body = JSON.stringify(body);

    var res;
    try {
      res = await fetch(BASE_URL + path, options);
    } catch (err) {
      throw apiError("无法连接服务器，请确认后端已启动（" + BASE_URL + "）", "NETWORK", 0);
    }

    var payload = null;
    try {
      payload = await res.json();
    } catch (err) {
      payload = null;
    }

    // Access Token 过期：用 Refresh Token 静默续期后重试一次
    if (res.status === 401 && useAuth && !retried && tokens && tokens.refresh_token) {
      var renewed = await tryRefresh(tokens.refresh_token);
      if (renewed) return send(method, path, body, useAuth, true);
    }

    if (!res.ok || !payload || payload.code !== 0) {
      var message =
        (payload && payload.message) || "请求失败（HTTP " + res.status + "）";
      throw apiError(message, payload && payload.code, res.status);
    }

    return payload.data;
  }

  /* ------------------------------ 对外 API ------------------------------ */

  var Api = {
    BASE_URL: BASE_URL,

    tokens: readTokens,
    setTokens: writeTokens,
    clearTokens: function () {
      writeTokens(null);
    },

    // 账号
    sendCode: function (email, purpose) {
      return send("POST", "/auth/send-code", { email: email, purpose: purpose }, false);
    },
    register: function (payload) {
      return send("POST", "/auth/register", payload, false);
    },
    login: function (email, password, remember) {
      return send(
        "POST",
        "/auth/login",
        { email: email, password: password, remember: remember !== false },
        false
      );
    },
    resetPassword: function (payload) {
      return send("POST", "/auth/reset-password", payload, false);
    },
    logout: function () {
      return send("POST", "/auth/logout", {}, true);
    },
    me: function () {
      return send("GET", "/account/me", null, true);
    },
    deleteAccount: function () {
      return send("DELETE", "/account", { confirm_text: "注销" }, true);
    },
    updateTheme: function (theme) {
      return send("PUT", "/account/theme", { theme: theme }, true);
    },
    updateName: function (name) {
      return send("PUT", "/account/name", { name: name }, true);
    },
    restore: function (data) {
      return send("POST", "/export/restore", data, true);
    },

    // 以 blob 形式下载文件（用于导出 JSON/CSV）
    download: function (path, filename) {
      var tokens = readTokens();
      var headers = { "Content-Type": "application/json" };
      if (tokens && tokens.access) headers.Authorization = "Bearer " + tokens.access;

      return fetch(BASE_URL + path, {
        method: "GET",
        headers: headers,
        credentials: "include"
      }).then(function (res) {
        if (!res.ok) {
          throw apiError("下载失败（HTTP " + res.status + "）", 0, res.status);
        }
        return res.blob().then(function (blob) {
          var url = global.URL.createObjectURL(blob);
          var a = global.document.createElement("a");
          a.href = url;
          a.download = filename;
          global.document.body.appendChild(a);
          a.click();
          global.document.body.removeChild(a);
          global.setTimeout(function () { global.URL.revokeObjectURL(url); }, 1000);
        });
      });
    },

    // 通用方法（供后续业务模块对接）
    get: function (path) {
      return send("GET", path, null, true);
    },
    post: function (path, body) {
      return send("POST", path, body, true);
    },
    put: function (path, body) {
      return send("PUT", path, body, true);
    },
    del: function (path, body) {
      return send("DELETE", path, body, true);
    }
  };

  global.Api = Api;
})(window);
