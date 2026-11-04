const LoginActivity = require("../Model/LoginActivity");

const { hashLoginSessionToken } = require("../utils/loginAuthSecurity");

const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

const getSessionToken = (req) => {
  const token = req.get("x-login-session");

  if (typeof token !== "string") {
    return "";
  }

  return token.trim();
};

const verifyLoginSession = async (req, res, next) => {
  try {
    if (!req.firebaseUser?.uid) {
      return res.status(500).json({
        error: "LOGIN_SESSION_MIDDLEWARE_ORDER_INVALID",
      });
    }

    const sessionToken = getSessionToken(req);

    if (!sessionToken) {
      return res.status(401).json({
        error: "LOGIN_SESSION_REQUIRED",
      });
    }

    let sessionTokenHash;

    try {
      sessionTokenHash = hashLoginSessionToken(sessionToken);
    } catch (error) {
      return res.status(401).json({
        error: "INVALID_LOGIN_SESSION",
      });
    }

    const activity = await LoginActivity.findOne({
      firebaseUid: req.firebaseUser.uid,

      "session.tokenHash": sessionTokenHash,
    });

    if (!activity) {
      return res.status(401).json({
        error: "INVALID_LOGIN_SESSION",
      });
    }

    const now = new Date();

    if (
      activity.session.status === "revoked" ||
      activity.session.status === "expired"
    ) {
      return res.status(401).json({
        error: "LOGIN_SESSION_INACTIVE",
      });
    }

    if (activity.session.status !== "active") {
      return res.status(401).json({
        error: "LOGIN_SESSION_NOT_ACTIVE",
      });
    }

    if (
      !activity.session.expiresAt ||
      new Date(activity.session.expiresAt).getTime() <= now.getTime()
    ) {
      await LoginActivity.updateOne(
        {
          _id: activity._id,

          "session.status": "active",
        },
        {
          $set: {
            "session.status": "expired",

            "session.revokedAt": now,

            "session.revokedReason": "SESSION_EXPIRED",
          },
        },
      );

      return res.status(401).json({
        error: "LOGIN_SESSION_EXPIRED",
      });
    }

    const lastSeenAt = activity.session.lastSeenAt
      ? new Date(activity.session.lastSeenAt)
      : null;

    if (
      !lastSeenAt ||
      now.getTime() - lastSeenAt.getTime() >= LAST_SEEN_UPDATE_INTERVAL_MS
    ) {
      await LoginActivity.updateOne(
        {
          _id: activity._id,

          "session.status": "active",
        },
        {
          $set: {
            "session.lastSeenAt": now,
          },
        },
      );
    }

    req.loginSession = {
      activityId: activity._id.toString(),

      userId: activity.user.toString(),

      firebaseUid: activity.firebaseUid,

      sessionExpiresAt: activity.session.expiresAt,

      browser: activity.browser,

      os: activity.os,

      device: activity.device,

      ipAddress: activity.ipAddress,
    };

    return next();
  } catch (error) {
    console.error("Login session validation failed:", error);

    return res.status(500).json({
      error: "LOGIN_SESSION_VALIDATION_FAILED",
    });
  }
};

module.exports = verifyLoginSession;
