const express = require("express");
const c = require("../controllers/exportController");
const router = express.Router();

router.get("/json", c.json);
router.get("/csv", c.csv);
router.post("/restore", c.restore);

module.exports = router;
