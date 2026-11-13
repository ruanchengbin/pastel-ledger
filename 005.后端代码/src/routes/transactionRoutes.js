const express = require("express");
const c = require("../controllers/transactionController");
const router = express.Router();

router.post("/", c.create);
router.post("/batch", c.batchCreate);
router.get("/", c.list);
router.get("/:id", c.get);
router.put("/:id", c.update);
router.delete("/:id", c.del);
router.post("/:id/restore", c.restore);

module.exports = router;
