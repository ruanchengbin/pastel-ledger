const express = require("express");
const c = require("../controllers/authController");
const authRequired = require("../middleware/auth");
const { sendCodeLimiter, loginLimiter, resetPasswordLimiter } = require("../middleware/rateLimit");
const router = express.Router();

router.post("/send-code", sendCodeLimiter, c.sendCode);
router.post("/register", loginLimiter, c.register);
router.post("/login", loginLimiter, c.login);
router.post("/refresh", c.refresh);
router.post("/logout", authRequired, c.logout);
router.post("/reset-password", resetPasswordLimiter, c.resetPassword);

module.exports = router;
