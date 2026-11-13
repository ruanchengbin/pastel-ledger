const router = require("express").Router();
const c = require("../controllers/linkController");

router.get("/", c.list);
router.post("/", c.request);
router.post("/:id/accept", c.accept);
router.post("/:id/reject", c.reject);
router.post("/:id/cancel", c.cancel);
router.post("/:id/revoke", c.revoke);

module.exports = router;
