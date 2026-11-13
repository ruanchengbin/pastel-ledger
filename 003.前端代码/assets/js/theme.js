/* ==========================================================================
   theme.js — 主题切换
   必须在 <head> 中同步加载，避免首屏主题闪变。
   ========================================================================== */

(function (global) {
  "use strict";

  var STORAGE_KEY = "ledger.theme.v1";
  var THEMES = ["macaron", "ocean", "mint", "apricot"];
  var META = {
    macaron: { name: "马卡龙紫", desc: "柔和紫调 · 默认" },
    ocean: { name: "海盐蓝", desc: "清透冷静" },
    mint: { name: "薄荷青", desc: "清爽自然" },
    apricot: { name: "暖杏橙", desc: "温暖柔和" }
  };

  function read() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      return null;
    }
  }

  function normalize(name) {
    return THEMES.indexOf(name) > -1 ? name : "macaron";
  }

  function apply(name) {
    var theme = normalize(name);
    document.documentElement.setAttribute("data-theme", theme);
    return theme;
  }

  function get() {
    return normalize(document.documentElement.getAttribute("data-theme"));
  }

  function set(name) {
    var theme = apply(name);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (err) {
      /* 忽略隐私模式下的写入失败 */
    }
    global.dispatchEvent(new CustomEvent("themechange", { detail: { theme: theme } }));
    return theme;
  }

  apply(read());

  global.Theme = {
    STORAGE_KEY: STORAGE_KEY,
    THEMES: THEMES,
    META: META,
    get: get,
    set: set
  };
})(window);
