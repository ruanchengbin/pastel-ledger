const express = require("express");
const c = require("../controllers/syncController");
const router = express.Router();

router.get("/pull", c.pull);
router.post("/push", c.push);
router.get("/full", c.full);

module.exports = router;
