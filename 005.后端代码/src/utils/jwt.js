const jwt = require("jsonwebtoken");
const config = require("../config");

function signAccess(userId) {
  return jwt.sign({ sub: userId, typ: "access" }, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiresSec,
    algorithm: "HS256",
  });
}

function verifyAccess(token) {
  try {
    return jwt.verify(token, config.jwt.secret, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}

module.exports = { signAccess, verifyAccess };
