const { verifyAdminSessionToken } = require("../utils/adminSession");

const verifyAdminSession = (req, res, next) => {
  try {
    const token = req.get("X-Admin-Session");

    if (!token) {
      return res.status(401).json({
        error: "ADMIN_SESSION_REQUIRED",
      });
    }

    const session = verifyAdminSessionToken(token);

    if (!session) {
      return res.status(401).json({
        error: "INVALID_ADMIN_SESSION",
      });
    }

    req.adminSession = session;

    return next();
  } catch (error) {
    console.error("Admin session verification failed:", error);

    return res.status(401).json({
      error: "INVALID_ADMIN_SESSION",
    });
  }
};

module.exports = verifyAdminSession;
