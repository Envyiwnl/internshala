const express = require("express");
const crypto = require("node:crypto");
const verifyAdminSession = require("../middleware/verifyAdminSession");

const { createAdminSession } = require("../utils/adminSession");

const router = express.Router();

const safeEqual = (submitted, expected) => {
  if (typeof submitted !== "string" || typeof expected !== "string") {
    return false;
  }

  const submittedBuffer = Buffer.from(submitted);

  const expectedBuffer = Buffer.from(expected);

  if (submittedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(submittedBuffer, expectedBuffer);
};

router.post("/adminlogin", (req, res) => {
  try {
    const adminUsername = process.env.ADMIN_USERNAME;

    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword || !process.env.ADMIN_SESSION_SECRET) {
      console.error("Admin authentication environment is not configured");

      return res.status(500).json({
        error: "ADMIN_AUTH_NOT_CONFIGURED",
      });
    }

    const { username, password } = req.body;

    const usernameMatches = safeEqual(username, adminUsername);

    const passwordMatches = safeEqual(password, adminPassword);

    if (!usernameMatches || !passwordMatches) {
      return res.status(401).json({
        error: "INVALID_ADMIN_CREDENTIALS",
      });
    }

    const session = createAdminSession();

    return res.status(200).json({
      message: "ADMIN_LOGIN_SUCCESS",
      adminSession: session.token,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error("Admin login failed:", error);

    return res.status(500).json({
      error: "ADMIN_LOGIN_FAILED",
    });
  }
});

router.get("/session", verifyAdminSession, (req, res) => {
  return res.status(200).json({
    authenticated: true,
    expiresAt: new Date(req.adminSession.expiresAt),
  });
});

module.exports = router;
