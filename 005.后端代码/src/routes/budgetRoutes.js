const express = require("express");
const c = require("../controllers/budgetController");
const router = express.Router();

router.get("/", c.get);
router.put("/", c.save);
router.get("/progress", c.progress);

module.exports = router;
