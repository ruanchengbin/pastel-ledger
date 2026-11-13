const express = require("express");
const c = require("../controllers/accountController");
const router = express.Router();

router.get("/me", c.me);
router.put("/name", c.changeName);
router.put("/theme", c.changeTheme);
router.put("/password", c.changePassword);
router.delete("/", c.deleteAccount);

module.exports = router;
