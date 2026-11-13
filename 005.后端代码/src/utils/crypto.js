const crypto = require("crypto");

function sha256Hex(str) {
  return crypto.createHash("sha256").update(String(str)).digest("hex");
}

function randomToken(len = 32) {
  return crypto.randomBytes(len).toString("hex");
}

function randomCode() {
  // 6 位数字
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = { sha256Hex, randomToken, randomCode };
