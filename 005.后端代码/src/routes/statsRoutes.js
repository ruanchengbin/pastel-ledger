const express = require("express");
const c = require("../controllers/statsController");
const router = express.Router();

router.get("/summary", c.summary);
router.get("/breakdown", c.breakdown);
router.get("/trend", c.trend);
router.get("/comparison", c.comparison);

module.exports = router;
