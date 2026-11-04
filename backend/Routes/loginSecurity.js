const express = require("express");
const mongoose = require("mongoose");

const User = require("../Model/User");
const LoginActivity = require("../Model/LoginActivity");

const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");
const verifyLoginSession = require("../middleware/verifyLoginSession");

const {
  getLoginRequestAudit,
  isGoogleChrome,
  isMobileDevice,
  isWithinMobileLoginWindow,
} = require("../utils/loginSecurity");

const {
  generateLoginOtp,
  hashLoginOtp,
  verifyLoginOtpHash,

  hashLoginChallengeToken,

  hashLoginSessionToken,

  hashLoginStartRequestId,
  deriveLoginChallengeToken,
  deriveLoginSessionToken,
  deriveVerifiedLoginSessionToken,

  buildBrowserKey,
  buildDeviceKey,

  getOtpExpiresAt,
  getChallengeExpiresAt,
  getSessionExpiresAt,
  getOtpResendAvailableAt,

  MAX_LOGIN_OTP_ATTEMPTS,
  MAX_LOGIN_OTP_RESENDS,
} = require("../utils/loginAuthSecurity");

const {
  sendLoginVerificationOtp,
} = require("../services/loginSecurityEmailService");

const router = express.Router();

const getEnvironmentState = async ({
  userId,
  audit,
  browserKey,
  deviceKey,
}) => {
  const successfulLoginFilter = {
    user: userId,
    loginStatus: "success",
  };

  const [knownBrowser, knownDevice, knownIp, trustedEnvironment] =
    await Promise.all([
      LoginActivity.exists({
        ...successfulLoginFilter,
        "environment.browserKey": browserKey,
      }),

      LoginActivity.exists({
        ...successfulLoginFilter,
        "environment.deviceKey": deviceKey,
      }),

      audit.ipAddress
        ? LoginActivity.exists({
            ...successfulLoginFilter,
            ipAddress: audit.ipAddress,
          })
        : Promise.resolve(null),

      LoginActivity.exists({
        ...successfulLoginFilter,
        "environment.browserKey": browserKey,
        "environment.deviceKey": deviceKey,
        "environment.trusted": true,
      }),
    ]);

  return {
    isNewBrowser: !knownBrowser,
    isNewDevice: !knownDevice,
    isNewIp: audit.ipAddress ? !knownIp : false,
    trusted: Boolean(trustedEnvironment),
  };
};

const expireExistingChallenges = async ({ userId, now }) => {
  await LoginActivity.updateMany(
    {
      user: userId,
      "challenge.status": "pending",
    },
    {
      $set: {
        loginStatus: "failed",

        failureReason: "SUPERSEDED_BY_NEW_LOGIN_REQUEST",

        "challenge.status": "expired",

        "verification.status": "expired",

        "session.status": "none",

        updatedAt: now,
      },
    },
  );
};

const expireStaleSessions = async ({ userId, now = new Date() }) => {
  await LoginActivity.updateMany(
    {
      user: userId,

      "session.status": "active",

      "session.expiresAt": {
        $lte: now,
      },
    },
    {
      $set: {
        "session.status": "expired",

        "session.revokedAt": now,

        "session.revokedReason": "SESSION_EXPIRED",
      },
    },
  );
};

const respondToExistingLoginStart = ({
  activity,
  requestId,
  user,
  now,
  res,
}) => {
  const userId = user._id.toString();

  if (
    activity.loginStatus === "otp_pending" &&
    activity.challenge?.status === "pending" &&
    activity.verification?.status === "pending" &&
    activity.challenge?.expiresAt &&
    new Date(activity.challenge.expiresAt) > now
  ) {
    const challengeToken = deriveLoginChallengeToken({
      requestId,
      userId,
    });

    const expectedHash = hashLoginChallengeToken(challengeToken);

    if (activity.challenge.tokenHash !== expectedHash) {
      return res.status(409).json({
        error: "LOGIN_START_REQUEST_CONFLICT",
      });
    }

    return res.status(202).json({
      message: "LOGIN_OTP_REQUIRED",

      requiresOtp: true,

      challengeToken,

      activityId: activity._id,

      destination: user.email.replace(/^(.{2}).*(@.*)$/, "$1***$2"),

      otpExpiresAt: activity.verification.otpExpiresAt,

      challengeExpiresAt: activity.challenge.expiresAt,

      resendAvailableAt: getOtpResendAvailableAt(
        activity.verification.lastOtpSentAt || activity.loginAt,
      ),

      isNewBrowser: activity.environment?.isNewBrowser || false,

      isNewDevice: activity.environment?.isNewDevice || false,

      isNewIp: activity.environment?.isNewIp || false,
    });
  }

  if (
    activity.loginStatus === "success" &&
    activity.session?.status === "active" &&
    activity.session?.expiresAt &&
    new Date(activity.session.expiresAt) > now
  ) {
    const sessionToken = deriveLoginSessionToken({
      requestId,
      userId,
    });

    const expectedHash = hashLoginSessionToken(sessionToken);

    if (activity.session.tokenHash !== expectedHash) {
      return res.status(409).json({
        error: "LOGIN_START_REQUEST_CONFLICT",
      });
    }

    return res.status(200).json({
      message: "LOGIN_ALLOWED",

      requiresOtp: false,

      activityId: activity._id,

      sessionToken,

      sessionExpiresAt: activity.session.expiresAt,

      isNewBrowser: activity.environment?.isNewBrowser || false,

      isNewDevice: activity.environment?.isNewDevice || false,

      isNewIp: activity.environment?.isNewIp || false,
    });
  }

  if (activity.failureReason === "MOBILE_LOGIN_OUTSIDE_ALLOWED_HOURS") {
    return res.status(403).json({
      error: "MOBILE_LOGIN_OUTSIDE_ALLOWED_HOURS",

      message: "Mobile login is allowed only between 10:00 AM and 1:00 PM IST.",

      activityId: activity._id,

      allowedWindow: {
        start: "10:00",
        end: "13:00",
        timezone: "Asia/Kolkata",
      },
    });
  }

  if (activity.failureReason === "LOGIN_EMAIL_NOT_AVAILABLE") {
    return res.status(400).json({
      error: "LOGIN_EMAIL_NOT_AVAILABLE",

      activityId: activity._id,
    });
  }

  if (activity.failureReason === "LOGIN_OTP_DELIVERY_FAILED") {
    return res.status(502).json({
      error: "LOGIN_OTP_DELIVERY_FAILED",
    });
  }

  return res.status(409).json({
    error: "LOGIN_START_REQUEST_ALREADY_COMPLETED",
  });
};

router.post("/start", verifyFirebaseToken, async (req, res) => {
  let duplicateStartContext = null;

  try {
    const requestId =
      typeof req.body?.requestId === "string" ? req.body.requestId.trim() : "";

    if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) {
      return res.status(400).json({
        error: "INVALID_LOGIN_START_REQUEST_ID",
      });
    }
    const firebaseUser = req.firebaseUser;

    const user = await User.findOne({
      firebaseUid: firebaseUser.uid,
    });

    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const startRequestHash = hashLoginStartRequestId(requestId);

    const now = new Date();

    duplicateStartContext = {
      user,
      requestId,
      startRequestHash,
    };

    const existingStart = await LoginActivity.findOne({
      user: user._id,

      startRequestHash,
    }).select("+challenge.tokenHash +session.tokenHash");

    if (existingStart) {
      return respondToExistingLoginStart({
        activity: existingStart,
        requestId,
        user,
        now,
        res,
      });
    }

    const audit = await getLoginRequestAudit(req);

    const browserKey = buildBrowserKey(audit);

    const deviceKey = buildDeviceKey(audit);

    const environment = await getEnvironmentState({
      userId: user._id,
      audit,
      browserKey,
      deviceKey,
    });

    const environmentData = {
      browserKey,
      deviceKey,

      isNewBrowser: environment.isNewBrowser,

      isNewDevice: environment.isNewDevice,

      isNewIp: environment.isNewIp,

      trusted: environment.trusted,
    };

    if (isMobileDevice(audit) && !isWithinMobileLoginWindow(now)) {
      const activity = await LoginActivity.create({
        user: user._id,

        firebaseUid: user.firebaseUid,

        email: user.email || "",

        startRequestHash,

        loginStatus: "rejected",

        failureReason: "MOBILE_LOGIN_OUTSIDE_ALLOWED_HOURS",

        loginAt: now,

        ipAddress: audit.ipAddress,

        userAgent: audit.userAgent,

        browser: audit.browser,

        os: audit.os,

        device: audit.device,

        location: audit.location,

        environment: environmentData,

        challenge: {
          status: "none",
        },

        verification: {
          required: false,
          method: "none",
          status: "not_required",
        },

        session: {
          status: "none",
        },
      });

      return res.status(403).json({
        error: "MOBILE_LOGIN_OUTSIDE_ALLOWED_HOURS",

        message:
          "Mobile login is allowed only between 10:00 AM and 1:00 PM IST.",

        activityId: activity._id,

        allowedWindow: {
          start: "10:00",
          end: "13:00",
          timezone: "Asia/Kolkata",
        },
      });
    }

    if (isGoogleChrome(audit)) {
      if (!user.email) {
        const activity = await LoginActivity.create({
          user: user._id,

          firebaseUid: user.firebaseUid,

          email: "",

          startRequestHash,

          loginStatus: "failed",

          failureReason: "LOGIN_EMAIL_NOT_AVAILABLE",

          loginAt: now,

          ipAddress: audit.ipAddress,

          userAgent: audit.userAgent,

          browser: audit.browser,

          os: audit.os,

          device: audit.device,

          location: audit.location,

          environment: environmentData,

          challenge: {
            status: "none",
          },

          verification: {
            required: true,
            method: "email_otp",
            status: "failed",
          },

          session: {
            status: "none",
          },
        });

        return res.status(400).json({
          error: "LOGIN_EMAIL_NOT_AVAILABLE",

          activityId: activity._id,
        });
      }

      await expireExistingChallenges({
        userId: user._id,
        now,
      });

      const challengeToken = deriveLoginChallengeToken({
        requestId,

        userId: user._id.toString(),
      });

      const challengeTokenHash = hashLoginChallengeToken(challengeToken);

      const otp = generateLoginOtp();

      const activity = new LoginActivity({
        user: user._id,

        firebaseUid: user.firebaseUid,

        email: user.email,

        startRequestHash,

        loginStatus: "otp_pending",

        failureReason: "",

        loginAt: now,

        ipAddress: audit.ipAddress,

        userAgent: audit.userAgent,

        browser: audit.browser,

        os: audit.os,

        device: audit.device,

        location: audit.location,

        environment: environmentData,

        challenge: {
          tokenHash: challengeTokenHash,

          status: "pending",

          expiresAt: getChallengeExpiresAt(now),

          consumedAt: null,
        },

        verification: {
          required: true,

          method: "email_otp",

          status: "pending",

          otpHash: "",

          otpExpiresAt: getOtpExpiresAt(now),

          attempts: 0,

          resendCount: 0,

          lastOtpSentAt: now,

          verifiedAt: null,
        },

        session: {
          status: "none",
        },
      });

      activity.verification.otpHash = hashLoginOtp({
        activityId: activity._id.toString(),

        otp,
      });

      await activity.save();

      try {
        await sendLoginVerificationOtp({
          email: user.email,

          otp,

          language: user.preferredLanguage || "en",

          browserName: audit.browser?.name || "",

          deviceType: audit.device?.type || "",
        });
      } catch (emailError) {
        await LoginActivity.updateOne(
          {
            _id: activity._id,
          },
          {
            $set: {
              loginStatus: "failed",

              failureReason: "LOGIN_OTP_DELIVERY_FAILED",

              "challenge.status": "expired",

              "verification.status": "failed",
            },
          },
        );

        return res.status(502).json({
          error: "LOGIN_OTP_DELIVERY_FAILED",
        });
      }

      return res.status(202).json({
        message: "LOGIN_OTP_REQUIRED",

        requiresOtp: true,

        challengeToken,

        activityId: activity._id,

        destination: user.email.replace(/^(.{2}).*(@.*)$/, "$1***$2"),

        otpExpiresAt: activity.verification.otpExpiresAt,

        challengeExpiresAt: activity.challenge.expiresAt,

        resendAvailableAt: getOtpResendAvailableAt(now),

        isNewBrowser: environment.isNewBrowser,

        isNewDevice: environment.isNewDevice,

        isNewIp: environment.isNewIp,
      });
    }

    const sessionToken = deriveLoginSessionToken({
      requestId,

      userId: user._id.toString(),
    });

    const sessionTokenHash = hashLoginSessionToken(sessionToken);

    const sessionExpiresAt = getSessionExpiresAt(now);

    const activity = await LoginActivity.create({
      user: user._id,

      firebaseUid: user.firebaseUid,

      email: user.email || "",

      startRequestHash,

      loginStatus: "success",

      failureReason: "",

      loginAt: now,

      ipAddress: audit.ipAddress,

      userAgent: audit.userAgent,

      browser: audit.browser,

      os: audit.os,

      device: audit.device,

      location: audit.location,

      environment: {
        ...environmentData,

        trusted: true,
      },

      challenge: {
        status: "none",
      },

      verification: {
        required: false,

        method: "none",

        status: "not_required",
      },

      session: {
        tokenHash: sessionTokenHash,

        status: "active",

        createdAt: now,

        lastSeenAt: now,

        expiresAt: sessionExpiresAt,

        revokedAt: null,

        revokedReason: "",
      },
    });

    return res.status(200).json({
      message: "LOGIN_ALLOWED",

      requiresOtp: false,

      activityId: activity._id,

      sessionToken,

      sessionExpiresAt,

      isNewBrowser: environment.isNewBrowser,

      isNewDevice: environment.isNewDevice,

      isNewIp: environment.isNewIp,
    });
  } catch (error) {
    if (error?.code === 11000 && duplicateStartContext) {
      try {
        const { user, requestId, startRequestHash } = duplicateStartContext;

        const existingStart = await LoginActivity.findOne({
          user: user._id,
          startRequestHash,
        }).select("+challenge.tokenHash +session.tokenHash");

        if (existingStart) {
          return respondToExistingLoginStart({
            activity: existingStart,
            requestId,
            user,
            now: new Date(),
            res,
          });
        }
      } catch (recoveryError) {
        console.error("Duplicate login start recovery failed:", recoveryError);
      }
    }

    console.error("Login security start failed:", error);

    return res.status(500).json({
      error: "LOGIN_SECURITY_START_FAILED",
    });
  }
});

router.post("/verify-otp", verifyFirebaseToken, async (req, res) => {
  try {
    const { challengeToken, otp } = req.body;

    if (typeof challengeToken !== "string" || !challengeToken.trim()) {
      return res.status(400).json({
        error: "LOGIN_CHALLENGE_TOKEN_REQUIRED",
      });
    }

    if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        error: "INVALID_OTP_FORMAT",
      });
    }

    const challengeTokenHash = hashLoginChallengeToken(challengeToken.trim());

    const activity = await LoginActivity.findOne({
      firebaseUid: req.firebaseUser.uid,

      "challenge.tokenHash": challengeTokenHash,
    }).select("+challenge.tokenHash +verification.otpHash +session.tokenHash");

    if (!activity) {
      return res.status(404).json({
        error: "LOGIN_CHALLENGE_NOT_FOUND",
      });
    }

    const now = new Date();

    if (
      activity.loginStatus === "success" ||
      activity.challenge.status === "consumed"
    ) {
      const existingOtpMatches = verifyLoginOtpHash({
        activityId: activity._id.toString(),

        otp,

        storedHash: activity.verification.otpHash,
      });

      if (!existingOtpMatches) {
        return res.status(409).json({
          error: "LOGIN_CHALLENGE_ALREADY_USED",
        });
      }

      if (
        activity.loginStatus !== "success" ||
        activity.challenge.status !== "consumed" ||
        activity.session.status !== "active" ||
        !activity.session.expiresAt ||
        new Date(activity.session.expiresAt).getTime() <= now.getTime()
      ) {
        return res.status(409).json({
          error: "LOGIN_CHALLENGE_ALREADY_USED",
        });
      }

      const sessionToken = deriveVerifiedLoginSessionToken({
        challengeToken: challengeToken.trim(),

        userId: activity.user.toString(),
      });

      const expectedSessionHash = hashLoginSessionToken(sessionToken);

      if (activity.session.tokenHash !== expectedSessionHash) {
        return res.status(409).json({
          error: "LOGIN_OTP_VERIFICATION_CONFLICT",
        });
      }

      return res.status(200).json({
        message: "LOGIN_VERIFIED",

        activityId: activity._id,

        sessionToken,

        sessionExpiresAt: activity.session.expiresAt,

        isNewBrowser: activity.environment.isNewBrowser,

        isNewDevice: activity.environment.isNewDevice,

        isNewIp: activity.environment.isNewIp,

        trusted: activity.environment.trusted,
      });
    }

    if (activity.challenge.status !== "pending") {
      return res.status(410).json({
        error: "LOGIN_CHALLENGE_CLOSED",
      });
    }

    if (
      !activity.challenge.expiresAt ||
      new Date(activity.challenge.expiresAt).getTime() <= now.getTime()
    ) {
      await LoginActivity.updateOne(
        {
          _id: activity._id,

          "challenge.status": "pending",
        },
        {
          $set: {
            loginStatus: "failed",

            failureReason: "LOGIN_CHALLENGE_EXPIRED",

            "challenge.status": "expired",

            "verification.status": "expired",

            "session.status": "none",
          },
        },
      );

      return res.status(410).json({
        error: "LOGIN_CHALLENGE_EXPIRED",
      });
    }

    if (activity.verification.status !== "pending") {
      return res.status(409).json({
        error: "LOGIN_OTP_NOT_PENDING",
      });
    }

    if (activity.verification.attempts >= MAX_LOGIN_OTP_ATTEMPTS) {
      return res.status(429).json({
        error: "LOGIN_OTP_ATTEMPTS_EXCEEDED",
      });
    }

    if (
      !activity.verification.otpExpiresAt ||
      new Date(activity.verification.otpExpiresAt).getTime() <= now.getTime()
    ) {
      await LoginActivity.updateOne(
        {
          _id: activity._id,

          "challenge.status": "pending",

          "verification.status": "pending",
        },
        {
          $set: {
            "verification.status": "expired",

            failureReason: "LOGIN_OTP_EXPIRED",
          },
        },
      );

      return res.status(410).json({
        error: "LOGIN_OTP_EXPIRED",

        canResend: true,
      });
    }

    const otpMatches = verifyLoginOtpHash({
      activityId: activity._id.toString(),

      otp,

      storedHash: activity.verification.otpHash,
    });

    const submittedOtpHash = hashLoginOtp({
      activityId: activity._id.toString(),
      otp,
    });

    if (!otpMatches) {
      const attemptedActivity = await LoginActivity.findOneAndUpdate(
        {
          _id: activity._id,

          firebaseUid: req.firebaseUser.uid,

          "challenge.status": "pending",

          "verification.status": "pending",

          "verification.attempts": {
            $lt: MAX_LOGIN_OTP_ATTEMPTS,
          },

          "verification.lastFailedOtpHash": {
            $ne: submittedOtpHash,
          },
        },
        {
          $inc: {
            "verification.attempts": 1,
          },

          $set: {
            failureReason: "INVALID_LOGIN_OTP",

            "verification.lastFailedOtpHash": submittedOtpHash,
          },
        },
        {
          new: true,
        },
      );

      if (!attemptedActivity) {
        const duplicateAttempt = await LoginActivity.findOne({
          _id: activity._id,

          firebaseUid: req.firebaseUser.uid,

          "challenge.status": "pending",

          "verification.status": "pending",

          "verification.lastFailedOtpHash": submittedOtpHash,
        }).select("verification.attempts");

        if (duplicateAttempt) {
          const attemptsRemaining = Math.max(
            0,
            MAX_LOGIN_OTP_ATTEMPTS - duplicateAttempt.verification.attempts,
          );

          return res.status(400).json({
            error: "INVALID_LOGIN_OTP",

            attemptsRemaining,
          });
        }

        return res.status(409).json({
          error: "LOGIN_OTP_VERIFICATION_CONFLICT",
        });
      }

      const attemptsRemaining =
        MAX_LOGIN_OTP_ATTEMPTS - attemptedActivity.verification.attempts;

      if (attemptsRemaining <= 0) {
        await LoginActivity.updateOne(
          {
            _id: attemptedActivity._id,

            "challenge.status": "pending",
          },
          {
            $set: {
              loginStatus: "failed",

              failureReason: "LOGIN_OTP_ATTEMPTS_EXCEEDED",

              "verification.status": "failed",

              "challenge.status": "expired",

              "session.status": "none",
            },
          },
        );

        return res.status(429).json({
          error: "LOGIN_OTP_ATTEMPTS_EXCEEDED",

          attemptsRemaining: 0,
        });
      }

      return res.status(400).json({
        error: "INVALID_LOGIN_OTP",

        attemptsRemaining,
      });
    }

    const sessionToken = deriveVerifiedLoginSessionToken({
      challengeToken: challengeToken.trim(),

      userId: activity.user.toString(),
    });

    const sessionTokenHash = hashLoginSessionToken(sessionToken);

    const sessionExpiresAt = getSessionExpiresAt(now);

    const verifiedActivity = await LoginActivity.findOneAndUpdate(
      {
        _id: activity._id,

        firebaseUid: req.firebaseUser.uid,

        loginStatus: "otp_pending",

        "challenge.tokenHash": challengeTokenHash,

        "challenge.status": "pending",

        "challenge.expiresAt": {
          $gt: now,
        },

        "verification.status": "pending",

        "verification.otpHash": activity.verification.otpHash,

        "verification.otpExpiresAt": {
          $gt: now,
        },

        "verification.attempts": {
          $lt: MAX_LOGIN_OTP_ATTEMPTS,
        },
      },
      {
        $set: {
          loginStatus: "success",

          failureReason: "",

          "environment.trusted": true,

          "challenge.status": "consumed",

          "challenge.consumedAt": now,

          "verification.status": "verified",

          "verification.verifiedAt": now,

          "session.tokenHash": sessionTokenHash,

          "session.status": "active",

          "session.createdAt": now,

          "session.lastSeenAt": now,

          "session.expiresAt": sessionExpiresAt,

          "session.revokedAt": null,

          "session.revokedReason": "",
        },
      },
      {
        new: true,
      },
    );

    if (!verifiedActivity) {
      const completedActivity = await LoginActivity.findById(
        activity._id,
      ).select("+verification.otpHash +session.tokenHash");

      if (
        completedActivity?.loginStatus === "success" &&
        completedActivity.challenge?.status === "consumed" &&
        completedActivity.session?.status === "active" &&
        completedActivity.session?.expiresAt &&
        new Date(completedActivity.session.expiresAt).getTime() > now.getTime()
      ) {
        const completedSessionToken = deriveVerifiedLoginSessionToken({
          challengeToken: challengeToken.trim(),

          userId: completedActivity.user.toString(),
        });

        const expectedSessionHash = hashLoginSessionToken(
          completedSessionToken,
        );

        if (completedActivity.session.tokenHash === expectedSessionHash) {
          return res.status(200).json({
            message: "LOGIN_VERIFIED",

            activityId: completedActivity._id,

            sessionToken: completedSessionToken,

            sessionExpiresAt: completedActivity.session.expiresAt,

            isNewBrowser: completedActivity.environment.isNewBrowser,

            isNewDevice: completedActivity.environment.isNewDevice,

            isNewIp: completedActivity.environment.isNewIp,

            trusted: completedActivity.environment.trusted,
          });
        }
      }

      return res.status(409).json({
        error: "LOGIN_OTP_VERIFICATION_CONFLICT",
      });
    }

    return res.status(200).json({
      message: "LOGIN_VERIFIED",

      activityId: verifiedActivity._id,

      sessionToken,

      sessionExpiresAt,

      isNewBrowser: verifiedActivity.environment.isNewBrowser,

      isNewDevice: verifiedActivity.environment.isNewDevice,

      isNewIp: verifiedActivity.environment.isNewIp,

      trusted: verifiedActivity.environment.trusted,
    });
  } catch (error) {
    console.error("Login OTP verification failed:", error);

    return res.status(500).json({
      error: "LOGIN_OTP_VERIFICATION_FAILED",
    });
  }
});

router.post("/resend-otp", verifyFirebaseToken, async (req, res) => {
  try {
    const { challengeToken } = req.body;

    if (typeof challengeToken !== "string" || !challengeToken.trim()) {
      return res.status(400).json({
        error: "LOGIN_CHALLENGE_TOKEN_REQUIRED",
      });
    }

    const challengeTokenHash = hashLoginChallengeToken(challengeToken.trim());

    const activity = await LoginActivity.findOne({
      firebaseUid: req.firebaseUser.uid,

      "challenge.tokenHash": challengeTokenHash,
    }).select(
      "+challenge.tokenHash +verification.otpHash +verification.lastFailedOtpHash",
    );

    if (!activity) {
      return res.status(404).json({
        error: "LOGIN_CHALLENGE_NOT_FOUND",
      });
    }

    const now = new Date();

    if (
      activity.loginStatus === "success" ||
      activity.challenge.status === "consumed"
    ) {
      return res.status(409).json({
        error: "LOGIN_CHALLENGE_ALREADY_USED",
      });
    }

    if (activity.challenge.status !== "pending") {
      return res.status(410).json({
        error: "LOGIN_CHALLENGE_CLOSED",
      });
    }

    if (
      !activity.challenge.expiresAt ||
      new Date(activity.challenge.expiresAt).getTime() <= now.getTime()
    ) {
      await LoginActivity.updateOne(
        {
          _id: activity._id,
          "challenge.status": "pending",
        },
        {
          $set: {
            loginStatus: "failed",

            failureReason: "LOGIN_CHALLENGE_EXPIRED",

            "challenge.status": "expired",

            "verification.status": "expired",

            "session.status": "none",
          },
        },
      );

      return res.status(410).json({
        error: "LOGIN_CHALLENGE_EXPIRED",
      });
    }

    if (activity.verification.attempts >= MAX_LOGIN_OTP_ATTEMPTS) {
      return res.status(429).json({
        error: "LOGIN_OTP_ATTEMPTS_EXCEEDED",
      });
    }

    if (activity.verification.resendCount >= MAX_LOGIN_OTP_RESENDS) {
      return res.status(429).json({
        error: "LOGIN_OTP_RESEND_LIMIT_REACHED",
      });
    }

    if (activity.verification.lastOtpSentAt) {
      const resendAvailableAt = getOtpResendAvailableAt(
        new Date(activity.verification.lastOtpSentAt),
      );

      if (resendAvailableAt.getTime() > now.getTime()) {
        const retryAfterSeconds = Math.ceil(
          (resendAvailableAt.getTime() - now.getTime()) / 1000,
        );

        return res.status(429).json({
          error: "LOGIN_OTP_RESEND_COOLDOWN",

          retryAfterSeconds,

          resendAvailableAt,
        });
      }
    }

    const user = await User.findById(activity.user);

    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    if (!user.email) {
      return res.status(400).json({
        error: "LOGIN_EMAIL_NOT_AVAILABLE",
      });
    }

    const otp = generateLoginOtp();

    const otpHash = hashLoginOtp({
      activityId: activity._id.toString(),

      otp,
    });

    const otpExpiresAt = getOtpExpiresAt(now);

    const previousState = {
      otpHash: activity.verification.otpHash,

      otpExpiresAt: activity.verification.otpExpiresAt,

      status: activity.verification.status,

      resendCount: activity.verification.resendCount,

      lastOtpSentAt: activity.verification.lastOtpSentAt,

      lastFailedOtpHash: activity.verification.lastFailedOtpHash,

      failureReason: activity.failureReason,
    };

    const updatedActivity = await LoginActivity.findOneAndUpdate(
      {
        _id: activity._id,

        firebaseUid: req.firebaseUser.uid,

        loginStatus: "otp_pending",

        "challenge.status": "pending",

        "challenge.expiresAt": {
          $gt: now,
        },

        "verification.status": {
          $in: ["pending", "expired"],
        },

        "verification.resendCount": {
          $lt: MAX_LOGIN_OTP_RESENDS,
        },

        "verification.attempts": {
          $lt: MAX_LOGIN_OTP_ATTEMPTS,
        },

        "verification.lastOtpSentAt": activity.verification.lastOtpSentAt,
      },
      {
        $set: {
          failureReason: "",

          "verification.otpHash": otpHash,

          "verification.otpExpiresAt": otpExpiresAt,

          "verification.status": "pending",

          "verification.lastFailedOtpHash": "",

          "verification.lastOtpSentAt": now,
        },

        $inc: {
          "verification.resendCount": 1,
        },
      },
      {
        new: true,
      },
    ).select("+verification.otpHash");

    if (!updatedActivity) {
      return res.status(409).json({
        error: "LOGIN_OTP_RESEND_CONFLICT",
      });
    }

    try {
      await sendLoginVerificationOtp({
        email: user.email,

        otp,

        language: user.preferredLanguage || "en",

        browserName: updatedActivity.browser?.name || "",

        deviceType: updatedActivity.device?.type || "",
      });
    } catch (emailError) {
      await LoginActivity.updateOne(
        {
          _id: updatedActivity._id,

          "verification.otpHash": otpHash,

          "verification.lastOtpSentAt": now,
        },
        {
          $set: {
            "verification.otpHash": previousState.otpHash,

            "verification.otpExpiresAt": previousState.otpExpiresAt,

            "verification.status": previousState.status,

            "verification.resendCount": previousState.resendCount,

            "verification.lastFailedOtpHash": previousState.lastFailedOtpHash,

            "verification.lastOtpSentAt": previousState.lastOtpSentAt,

            failureReason: previousState.failureReason,
          },
        },
      );

      return res.status(502).json({
        error: "LOGIN_OTP_DELIVERY_FAILED",
      });
    }

    return res.status(200).json({
      message: "LOGIN_OTP_RESENT",

      otpExpiresAt,

      resendAvailableAt: getOtpResendAvailableAt(now),

      resendCount: updatedActivity.verification.resendCount,

      resendLimit: MAX_LOGIN_OTP_RESENDS,

      attempts: updatedActivity.verification.attempts,

      attemptLimit: MAX_LOGIN_OTP_ATTEMPTS,
    });
  } catch (error) {
    console.error("Login OTP resend failed:", error);

    return res.status(500).json({
      error: "LOGIN_OTP_RESEND_FAILED",
    });
  }
});

router.get(
  "/history",
  verifyFirebaseToken,
  verifyLoginSession,
  async (req, res) => {
    try {
      const history = await LoginActivity.find({
        user: req.loginSession.userId,
      })
        .select(
          [
            "loginStatus",
            "failureReason",
            "loginAt",

            "ipAddress",
            "userAgent",

            "browser",
            "os",
            "device",
            "location",

            "environment.trusted",
            "environment.isNewBrowser",
            "environment.isNewDevice",
            "environment.isNewIp",

            "challenge.status",
            "challenge.expiresAt",
            "challenge.consumedAt",

            "verification.required",
            "verification.method",
            "verification.status",
            "verification.otpExpiresAt",
            "verification.attempts",
            "verification.resendCount",
            "verification.lastOtpSentAt",
            "verification.verifiedAt",

            "session.status",
            "session.createdAt",
            "session.lastSeenAt",
            "session.expiresAt",
            "session.revokedAt",
            "session.revokedReason",

            "createdAt",
            "updatedAt",
          ].join(" "),
        )
        .sort({
          loginAt: -1,
        })
        .limit(100)
        .lean();

      const currentActivityId = req.loginSession.activityId;

      const sanitizedHistory = history.map((entry) => ({
        ...entry,

        isCurrentSession: entry._id.toString() === currentActivityId,
      }));

      return res.status(200).json({
        history: sanitizedHistory,
      });
    } catch (error) {
      console.error("Login history fetch failed:", error);

      return res.status(500).json({
        error: "LOGIN_HISTORY_FETCH_FAILED",
      });
    }
  },
);

router.get(
  "/sessions",
  verifyFirebaseToken,
  verifyLoginSession,
  async (req, res) => {
    try {
      const now = new Date();

      await expireStaleSessions({
        userId: req.loginSession.userId,
        now,
      });

      const sessions = await LoginActivity.find({
        user: req.loginSession.userId,

        loginStatus: "success",

        "session.status": "active",

        "session.expiresAt": {
          $gt: now,
        },
      })
        .select(
          [
            "loginAt",

            "ipAddress",

            "browser",
            "os",
            "device",
            "location",

            "environment.trusted",
            "environment.isNewBrowser",
            "environment.isNewDevice",
            "environment.isNewIp",

            "verification.method",

            "session.status",
            "session.createdAt",
            "session.lastSeenAt",
            "session.expiresAt",
          ].join(" "),
        )
        .sort({
          "session.lastSeenAt": -1,
        })
        .lean();

      const currentActivityId = req.loginSession.activityId;

      const sanitizedSessions = sessions.map((session) => ({
        ...session,

        isCurrentSession: session._id.toString() === currentActivityId,
      }));

      return res.status(200).json({
        sessions: sanitizedSessions,
      });
    } catch (error) {
      console.error("Active sessions fetch failed:", error);

      return res.status(500).json({
        error: "ACTIVE_SESSIONS_FETCH_FAILED",
      });
    }
  },
);

router.post(
  "/sessions/:activityId/revoke",
  verifyFirebaseToken,
  verifyLoginSession,
  async (req, res) => {
    try {
      const { activityId } = req.params;

      if (!mongoose.isValidObjectId(activityId)) {
        return res.status(400).json({
          error: "INVALID_SESSION_ID",
        });
      }

      if (activityId === req.loginSession.activityId) {
        return res.status(400).json({
          error: "CANNOT_REVOKE_CURRENT_SESSION_WITH_THIS_ROUTE",
        });
      }

      const now = new Date();

      const revokedSession = await LoginActivity.findOneAndUpdate(
        {
          _id: activityId,

          user: req.loginSession.userId,

          "session.status": "active",
        },
        {
          $set: {
            "session.status": "revoked",

            "session.revokedAt": now,

            "session.revokedReason": "REVOKED_BY_USER",
          },
        },
        {
          new: true,
        },
      );

      if (!revokedSession) {
        return res.status(404).json({
          error: "ACTIVE_SESSION_NOT_FOUND",
        });
      }

      return res.status(200).json({
        message: "SESSION_REVOKED",

        activityId: revokedSession._id,
      });
    } catch (error) {
      console.error("Remote session revocation failed:", error);

      return res.status(500).json({
        error: "SESSION_REVOCATION_FAILED",
      });
    }
  },
);

router.post(
  "/sessions/revoke-others",
  verifyFirebaseToken,
  verifyLoginSession,
  async (req, res) => {
    try {
      const now = new Date();

      const result = await LoginActivity.updateMany(
        {
          user: req.loginSession.userId,

          _id: {
            $ne: req.loginSession.activityId,
          },

          "session.status": "active",
        },
        {
          $set: {
            "session.status": "revoked",

            "session.revokedAt": now,

            "session.revokedReason": "REVOKED_BY_USER_FROM_ANOTHER_SESSION",
          },
        },
      );

      return res.status(200).json({
        message: "OTHER_SESSIONS_REVOKED",

        revokedCount: result.modifiedCount,
      });
    } catch (error) {
      console.error("Other session revocation failed:", error);

      return res.status(500).json({
        error: "OTHER_SESSIONS_REVOCATION_FAILED",
      });
    }
  },
);

router.post(
  "/logout",
  verifyFirebaseToken,
  verifyLoginSession,
  async (req, res) => {
    try {
      const now = new Date();

      const activity = await LoginActivity.findOneAndUpdate(
        {
          _id: req.loginSession.activityId,

          user: req.loginSession.userId,

          "session.status": "active",
        },
        {
          $set: {
            "session.status": "revoked",

            "session.revokedAt": now,

            "session.revokedReason": "USER_LOGOUT",
          },
        },
        {
          new: true,
        },
      );

      if (!activity) {
        return res.status(404).json({
          error: "ACTIVE_SESSION_NOT_FOUND",
        });
      }

      return res.status(200).json({
        message: "LOGOUT_RECORDED",
      });
    } catch (error) {
      console.error("Login session logout failed:", error);

      return res.status(500).json({
        error: "LOGIN_SESSION_LOGOUT_FAILED",
      });
    }
  },
);

router.get(
  "/session/current",
  verifyFirebaseToken,
  verifyLoginSession,
  async (req, res) => {
    return res.status(200).json({
      message: "LOGIN_SESSION_ACTIVE",

      session: {
        activityId: req.loginSession.activityId,

        expiresAt: req.loginSession.sessionExpiresAt,

        browser: req.loginSession.browser,

        os: req.loginSession.os,

        device: req.loginSession.device,

        ipAddress: req.loginSession.ipAddress,
      },
    });
  },
);

module.exports = router;
