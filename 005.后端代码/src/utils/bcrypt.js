const bcrypt = require("bcryptjs");
const config = require("../config");

async function hash(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}

async function compare(plain, hashValue) {
  return bcrypt.compare(plain, hashValue);
}

module.exports = { hash, compare };
