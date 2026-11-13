const express = require("express");
const c = require("../controllers/categoryController");
const router = express.Router();

router.get("/", c.list);
router.post("/", c.create);
router.put("/order", c.reorder);        // 必须放在 /:id 之前
router.put("/:id", c.update);
router.delete("/:id", c.del);
router.post("/:id/migrate", c.migrate);

module.exports = router;
