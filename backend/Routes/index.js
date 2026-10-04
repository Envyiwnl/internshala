const express = require("express");
const router = express.Router();
const admin = require("./admin");
const intern = require("./internship");
const job = require("./job");
const application = require("./application");
const user = require("./user");
const language = require("./language");
const resume = require("./resume");
const passwordReset = require("./passwordReset");

router.use("/admin", admin);
router.use("/internship", intern);
router.use("/job", job);
router.use("/resume", resume);
router.use("/application", application);
router.use("/user", user);
router.use("/language", language);
router.use("/password-reset", passwordReset);

module.exports = router;
