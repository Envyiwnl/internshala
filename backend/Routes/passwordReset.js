const express = require("express");

const User = require("../Model/User");
const PasswordReset = require("../Model/PasswordReset");

const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");

const getRequestAudit = require("../utils/getRequestAudit");

const {
  generateOtp,
  hashOtp,
  verifyOtpHash,
  generateSessionToken,
  hashSessionToken,
  generateTemporaryPassword,
} = require("../utils/passwordResetSecurity");

const {
  sendPasswordResetOtp,
  sendTemporaryPassword,
} = require("../services/passwordResetEmailService");

const {
  normalizePhoneNumber,
  isValidE164PhoneNumber,
  sendPasswordResetOtpSms,
  sendTemporaryPasswordSms,
} = require("../services/passwordResetSmsService");

const {
  getFirebaseUser,
  setTemporaryPassword,
  setPermanentPassword,
} = require("../services/passwordResetAuthService");

const router = express.Router();

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const RESET_SESSION_MS = 30 * 60 * 1000;
const RESET_REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const RESEND_COOLDOWN_MS = 60 * 1000;
const DELIVERY_STALE_MS = 30 * 1000;

const MAX_OTP_ATTEMPTS = 5;
const MAX_RESENDS = 3;
const MAX_DELIVERY_ATTEMPTS = 3;

const SUPPORTED_LANGUAGES = ["en", "es", "hi", "pt", "zh", "fr"];
const RESET_METHODS = ["email", "phone"];

const normalizeEmail = (email) => {
  if (typeof email !== "string") {
    return "";
  }

  return email.trim().toLowerCase();
};

const normalizeLanguage = (language, fallback = "en") => {
  if (typeof language !== "string") {
    return SUPPORTED_LANGUAGES.includes(fallback) ? fallback : "en";
  }

  const normalized = language.toLowerCase().split("-")[0];

  if (SUPPORTED_LANGUAGES.includes(normalized)) {
    return normalized;
  }

  return SUPPORTED_LANGUAGES.includes(fallback) ? fallback : "en";
};

const maskEmail = (email) => {
  const normalized = normalizeEmail(email);

  const [localPart, domain] = normalized.split("@");

  if (!localPart || !domain) {
    return "";
  }

  if (localPart.length <= 2) {
    return `${localPart[0] || "*"}***@${domain}`;
  }

  return `${localPart.slice(0, 2)}***@${domain}`;
};

const maskPhoneNumber = (phoneNumber) => {
  const normalized = normalizePhoneNumber(phoneNumber);

  if (!normalized || normalized.length < 5) {
    return "";
  }

  const lastFour = normalized.slice(-4);

  return `${"*".repeat(Math.max(normalized.length - 4, 4))}${lastFour}`;
};

const getMaskedDestination = (reset) => {
  if (reset.resetMethod === "email") {
    return maskEmail(reset.destination);
  }

  return maskPhoneNumber(reset.destination);
};

const isResetSessionExpired = (reset, now = new Date()) => {
  if (!reset?.requestedAt) {
    return true;
  }

  return (
    new Date(reset.requestedAt).getTime() + RESET_SESSION_MS <= now.getTime()
  );
};

const getResendAvailableAt = (reset) => {
  if (!reset?.lastOtpSentAt) {
    return null;
  }

  return new Date(new Date(reset.lastOtpSentAt).getTime() + RESEND_COOLDOWN_MS);
};

const getSessionExpiresAt = (reset) => {
  if (!reset?.requestedAt) {
    return null;
  }

  return new Date(new Date(reset.requestedAt).getTime() + RESET_SESSION_MS);
};

const expireResetSession = async (reset, reason = "RESET_SESSION_EXPIRED") => {
  if (!reset?._id || !reset.isActive) {
    return;
  }

  const now = new Date();

  const update = {
    isActive: false,
    status: "expired",
    expiredAt: now,
    failureReason: reason,
  };

  if (reset.verificationStatus === "pending") {
    update.verificationStatus = "expired";
  }

  await PasswordReset.updateOne(
    {
      _id: reset._id,
      isActive: true,
    },
    {
      $set: update,
    },
  );
};

const findResetBySessionToken = async (sessionToken) => {
  if (typeof sessionToken !== "string" || !sessionToken.trim()) {
    return null;
  }

  const sessionTokenHash = hashSessionToken(sessionToken.trim());

  return PasswordReset.findOne({
    sessionTokenHash,
  });
};

const findUserByResetIdentifier = async ({ method, identifier }) => {
  if (method === "email") {
    const email = normalizeEmail(identifier);

    if (!email) {
      return {
        user: null,
        destination: "",
      };
    }

    const user = await User.findOne({
      email,
    });

    return {
      user,
      destination: user?.email || email,
    };
  }

  const phoneNumber = normalizePhoneNumber(identifier);

  if (!isValidE164PhoneNumber(phoneNumber)) {
    return {
      user: null,
      destination: "",
    };
  }

  const user = await User.findOne({
    phoneNumber,
  });

  return {
    user,
    destination: user?.phoneNumber || phoneNumber,
  };
};

const sendOtpForReset = async ({ reset, otp }) => {
  if (reset.resetMethod === "email") {
    return sendPasswordResetOtp({
      email: reset.destination,
      otp,
      language: reset.preferredLanguage,
    });
  }

  return sendPasswordResetOtpSms({
    phoneNumber: reset.destination,
    otp,
    language: reset.preferredLanguage,
  });
};

const sendTemporaryPasswordForReset = async ({ reset, password }) => {
  if (reset.resetMethod === "email") {
    return sendTemporaryPassword({
      email: reset.destination,
      password,
      language: reset.preferredLanguage,
    });
  }

  return sendTemporaryPasswordSms({
    phoneNumber: reset.destination,
    password,
    language: reset.preferredLanguage,
  });
};

const getResetStatusPayload = (reset) => {
  const now = new Date();

  const resendAvailableAt = getResendAvailableAt(reset);

  const resendCooldownActive =
    resendAvailableAt && resendAvailableAt.getTime() > now.getTime();

  const staleDelivery =
    reset.deliveryStatus === "pending" &&
    reset.lastDeliveryAttemptAt &&
    new Date(reset.lastDeliveryAttemptAt).getTime() + DELIVERY_STALE_MS <=
      now.getTime();

  const canRetryDelivery =
    reset.isActive &&
    reset.verificationStatus === "verified" &&
    reset.deliveryAttempts < MAX_DELIVERY_ATTEMPTS &&
    (reset.deliveryStatus === "not_started" ||
      reset.deliveryStatus === "failed" ||
      staleDelivery);

  const canResend =
    reset.isActive &&
    reset.verificationStatus === "pending" &&
    reset.status === "otp_sent" &&
    reset.resendCount < MAX_RESENDS &&
    reset.otpAttempts < MAX_OTP_ATTEMPTS &&
    !resendCooldownActive &&
    !isResetSessionExpired(reset, now);

  return {
    resetMethod: reset.resetMethod,

    destination: getMaskedDestination(reset),

    status: reset.status,

    verificationStatus: reset.verificationStatus,

    deliveryStatus: reset.deliveryStatus,

    otpExpiresAt: reset.otpExpiresAt,

    sessionExpiresAt: getSessionExpiresAt(reset),

    resendAvailableAt,

    resendCount: reset.resendCount,

    resendLimit: MAX_RESENDS,

    otpAttempts: reset.otpAttempts,

    otpAttemptLimit: MAX_OTP_ATTEMPTS,

    deliveryAttempts: reset.deliveryAttempts,

    deliveryAttemptLimit: MAX_DELIVERY_ATTEMPTS,

    canResend,

    canRetryDelivery,

    completedAt: reset.completedAt,

    passwordDeliveredAt: reset.passwordDeliveredAt,
  };
};

const claimPasswordDelivery = async (resetId) => {
  const now = new Date();

  const staleBefore = new Date(now.getTime() - DELIVERY_STALE_MS);

  return PasswordReset.findOneAndUpdate(
    {
      _id: resetId,

      isActive: true,

      verificationStatus: "verified",

      status: {
        $in: ["verified", "password_updated", "delivery_failed"],
      },

      deliveryAttempts: {
        $lt: MAX_DELIVERY_ATTEMPTS,
      },

      $or: [
        {
          deliveryStatus: {
            $in: ["not_started", "failed"],
          },
        },

        {
          deliveryStatus: "pending",

          lastDeliveryAttemptAt: {
            $lte: staleBefore,
          },
        },
      ],
    },

    {
      $set: {
        deliveryStatus: "pending",
        lastDeliveryAttemptAt: now,
        failureReason: "",
      },

      $inc: {
        deliveryAttempts: 1,
        passwordGenerationCount: 1,
      },
    },

    {
      new: true,
    },
  );
};

const generateAndDeliverTemporaryPassword = async ({ reset, user }) => {
  const claimedReset = await claimPasswordDelivery(reset._id);

  if (!claimedReset) {
    const latestReset = await PasswordReset.findById(reset._id);

    if (!latestReset) {
      return {
        success: false,
        code: "PASSWORD_RESET_NOT_FOUND",
        status: 404,
      };
    }

    if (latestReset.status === "completed") {
      return {
        success: false,
        code: "PASSWORD_RESET_ALREADY_COMPLETED",
        status: 409,
        reset: latestReset,
      };
    }

    if (latestReset.deliveryAttempts >= MAX_DELIVERY_ATTEMPTS) {
      return {
        success: false,
        code: "PASSWORD_DELIVERY_ATTEMPTS_EXCEEDED",
        status: 429,
        reset: latestReset,
      };
    }

    if (latestReset.deliveryStatus === "pending") {
      return {
        success: false,
        code: "PASSWORD_DELIVERY_IN_PROGRESS",
        status: 409,
        reset: latestReset,
      };
    }

    return {
      success: false,
      code: "PASSWORD_DELIVERY_NOT_AVAILABLE",
      status: 409,
      reset: latestReset,
    };
  }

  const temporaryPassword = generateTemporaryPassword();

  try {
    await setTemporaryPassword({
      firebaseUid: user.firebaseUid,
      password: temporaryPassword,
    });

    const passwordUpdatedAt = new Date();

    await Promise.all([
      User.updateOne(
        {
          _id: user._id,
        },
        {
          $set: {
            mustChangePassword: true,
          },
        },
      ),

      PasswordReset.updateOne(
        {
          _id: claimedReset._id,
        },
        {
          $set: {
            status: "password_updated",
            passwordUpdatedAt,
            failureReason: "",
          },
        },
      ),
    ]);
  } catch (error) {
    await PasswordReset.updateOne(
      {
        _id: claimedReset._id,
      },
      {
        $set: {
          status: "verified",
          deliveryStatus: "failed",
          failureReason: "TEMPORARY_PASSWORD_UPDATE_FAILED",
        },
      },
    );

    return {
      success: false,
      code: "TEMPORARY_PASSWORD_UPDATE_FAILED",
      status: 500,
    };
  }

  try {
    await sendTemporaryPasswordForReset({
      reset: claimedReset,
      password: temporaryPassword,
    });
  } catch (error) {
    await PasswordReset.updateOne(
      {
        _id: claimedReset._id,
      },
      {
        $set: {
          status: "delivery_failed",
          deliveryStatus: "failed",
          failureReason: "TEMPORARY_PASSWORD_DELIVERY_FAILED",
        },
      },
    );

    return {
      success: false,
      code: "TEMPORARY_PASSWORD_DELIVERY_FAILED",
      status: 502,
    };
  }

  const completedAt = new Date();

  await Promise.all([
    PasswordReset.updateOne(
      {
        _id: claimedReset._id,
      },
      {
        $set: {
          status: "completed",

          isActive: false,

          deliveryStatus: "sent",

          passwordDeliveredAt: completedAt,

          completedAt,

          failureReason: "",
        },
      },
    ),

    User.updateOne(
      {
        _id: user._id,
      },
      {
        $set: {
          mustChangePassword: true,
          lastPasswordResetAt: completedAt,
        },
      },
    ),
  ]);

  return {
    success: true,
  };
};

router.post("/request", async (req, res) => {
  let claimedUser = null;
  let resetRecord = null;
  let nextRequestAllowedAt = null;
  let previousResetAvailableAt = null;

  try {
    const { method, identifier, language } = req.body;

    if (!RESET_METHODS.includes(method)) {
      return res.status(400).json({
        error: "INVALID_RESET_METHOD",
      });
    }

    if (typeof identifier !== "string" || !identifier.trim()) {
      return res.status(400).json({
        error: "RESET_IDENTIFIER_REQUIRED",
      });
    }

    const { user, destination } = await findUserByResetIdentifier({
      method,
      identifier,
    });

    if (!user) {
      return res.status(404).json({
        error: "INVALID_USER_DETAILS",
      });
    }

    let firebaseUser;

    try {
      firebaseUser = await getFirebaseUser(user.firebaseUid);
    } catch (error) {
      return res.status(404).json({
        error: "INVALID_USER_DETAILS",
      });
    }

    const passwordProvider = firebaseUser.providerData?.some(
      (provider) => provider.providerId === "password",
    );

    if (!passwordProvider) {
      return res.status(409).json({
        error: "PASSWORD_RESET_NOT_AVAILABLE",
      });
    }

    const now = new Date();

    nextRequestAllowedAt = new Date(now.getTime() + RESET_REQUEST_COOLDOWN_MS);

    previousResetAvailableAt = user.passwordResetAvailableAt || null;

    claimedUser = await User.findOneAndUpdate(
      {
        _id: user._id,

        $or: [
          {
            passwordResetAvailableAt: null,
          },

          {
            passwordResetAvailableAt: {
              $exists: false,
            },
          },

          {
            passwordResetAvailableAt: {
              $lte: now,
            },
          },
        ],
      },

      {
        $set: {
          passwordResetAvailableAt: nextRequestAllowedAt,
        },
      },

      {
        new: true,
      },
    );

    if (!claimedUser) {
      const currentUser = await User.findById(user._id).select(
        "passwordResetAvailableAt",
      );

      return res.status(429).json({
        error: "PASSWORD_RESET_DAILY_LIMIT",

        message: "You can use this option only once per day.",

        nextRequestAllowedAt: currentUser?.passwordResetAvailableAt || null,
      });
    }

    await PasswordReset.updateMany(
      {
        user: user._id,
        isActive: true,
        verificationStatus: "pending",
      },

      {
        $set: {
          isActive: false,

          status: "expired",

          verificationStatus: "expired",

          expiredAt: now,

          failureReason: "SUPERSEDED_BY_NEW_RESET_REQUEST",
        },
      },
    );

    await PasswordReset.updateMany(
      {
        user: user._id,
        isActive: true,
        verificationStatus: "verified",
      },

      {
        $set: {
          isActive: false,

          status: "expired",

          expiredAt: now,

          failureReason: "SUPERSEDED_BY_NEW_RESET_REQUEST",
        },
      },
    );

    const otp = generateOtp();

    const sessionToken = generateSessionToken();

    const sessionTokenHash = hashSessionToken(sessionToken);

    const otpHash = hashOtp({
      userId: user._id.toString(),
      otp,
    });

    const otpExpiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);

    const preferredLanguage = normalizeLanguage(
      language,
      user.preferredLanguage,
    );

    const audit = getRequestAudit(req);

    resetRecord = await PasswordReset.create({
      user: user._id,

      firebaseUid: user.firebaseUid,

      resetMethod: method,

      destination,

      preferredLanguage,

      sessionTokenHash,

      otpHash,

      otpExpiresAt,

      otpAttempts: 0,

      resendCount: 0,

      lastOtpSentAt: now,

      verificationStatus: "pending",

      status: "otp_sent",

      isActive: true,

      deliveryStatus: "not_started",

      deliveryAttempts: 0,

      passwordGenerationCount: 0,

      requestedAt: now,

      nextRequestAllowedAt,

      ...audit,
    });

    try {
      await sendOtpForReset({
        reset: resetRecord,
        otp,
      });
    } catch (error) {
      await PasswordReset.updateOne(
        {
          _id: resetRecord._id,
        },
        {
          $set: {
            isActive: false,

            status: "failed",

            failedAt: new Date(),

            failureReason: "INITIAL_OTP_DELIVERY_FAILED",
          },
        },
      );

      await User.updateOne(
        {
          _id: user._id,

          passwordResetAvailableAt: nextRequestAllowedAt,
        },
        {
          $set: {
            passwordResetAvailableAt: previousResetAvailableAt,
          },
        },
      );

      return res.status(502).json({
        error: "PASSWORD_RESET_OTP_DELIVERY_FAILED",
      });
    }

    return res.status(200).json({
      message: "PASSWORD_RESET_OTP_SENT",

      sessionToken,

      resetMethod: method,

      destination: getMaskedDestination(resetRecord),

      otpExpiresAt,

      sessionExpiresAt: getSessionExpiresAt(resetRecord),

      resendAvailableAt: getResendAvailableAt(resetRecord),

      resendLimit: MAX_RESENDS,

      otpAttemptLimit: MAX_OTP_ATTEMPTS,

      nextRequestAllowedAt,
    });
  } catch (error) {
    console.error("Password reset request failed:", error);

    if (claimedUser && nextRequestAllowedAt && !resetRecord) {
      try {
        await User.updateOne(
          {
            _id: claimedUser._id,

            passwordResetAvailableAt: nextRequestAllowedAt,
          },
          {
            $set: {
              passwordResetAvailableAt: previousResetAvailableAt,
            },
          },
        );
      } catch (rollbackError) {
        console.error("Password reset request rollback failed:", rollbackError);
      }
    }

    if (error?.code === 11000) {
      return res.status(409).json({
        error: "PASSWORD_RESET_ALREADY_ACTIVE",
      });
    }

    return res.status(500).json({
      error: "PASSWORD_RESET_REQUEST_FAILED",
    });
  }
});

router.post("/resend", async (req, res) => {
  try {
    const { sessionToken } = req.body;

    const reset = await findResetBySessionToken(sessionToken);

    if (!reset) {
      return res.status(404).json({
        error: "PASSWORD_RESET_SESSION_NOT_FOUND",
      });
    }

    const now = new Date();

    if (reset.status === "completed") {
      return res.status(409).json({
        error: "PASSWORD_RESET_ALREADY_COMPLETED",
      });
    }

    if (!reset.isActive) {
      return res.status(410).json({
        error: "PASSWORD_RESET_SESSION_CLOSED",
      });
    }

    if (isResetSessionExpired(reset, now)) {
      await expireResetSession(reset);

      return res.status(410).json({
        error: "PASSWORD_RESET_SESSION_EXPIRED",
      });
    }

    if (reset.verificationStatus === "verified") {
      return res.status(409).json({
        error: "OTP_ALREADY_VERIFIED",
      });
    }

    if (reset.otpAttempts >= MAX_OTP_ATTEMPTS) {
      await PasswordReset.updateOne(
        {
          _id: reset._id,
          isActive: true,
        },
        {
          $set: {
            isActive: false,

            status: "failed",

            verificationStatus: "failed",

            failedAt: now,

            failureReason: "OTP_ATTEMPTS_EXCEEDED",
          },
        },
      );

      return res.status(429).json({
        error: "OTP_ATTEMPTS_EXCEEDED",
      });
    }

    if (reset.resendCount >= MAX_RESENDS) {
      return res.status(429).json({
        error: "OTP_RESEND_LIMIT_REACHED",
      });
    }

    const resendAvailableAt = getResendAvailableAt(reset);

    if (resendAvailableAt && resendAvailableAt.getTime() > now.getTime()) {
      return res.status(429).json({
        error: "OTP_RESEND_COOLDOWN",

        resendAvailableAt,
      });
    }

    const otp = generateOtp();

    const newOtpHash = hashOtp({
      userId: reset.user.toString(),
      otp,
    });

    const otpExpiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);

    const previousState = {
      otpHash: reset.otpHash,

      otpExpiresAt: reset.otpExpiresAt,

      lastOtpSentAt: reset.lastOtpSentAt,

      resendCount: reset.resendCount,
    };

    const updatedReset = await PasswordReset.findOneAndUpdate(
      {
        _id: reset._id,

        isActive: true,

        verificationStatus: "pending",

        status: "otp_sent",

        resendCount: {
          $lt: MAX_RESENDS,
        },

        lastOtpSentAt: reset.lastOtpSentAt,
      },

      {
        $set: {
          otpHash: newOtpHash,

          otpExpiresAt,

          lastOtpSentAt: now,

          failureReason: "",
        },

        $inc: {
          resendCount: 1,
        },
      },

      {
        new: true,
      },
    );

    if (!updatedReset) {
      return res.status(409).json({
        error: "OTP_RESEND_CONFLICT",
      });
    }

    try {
      await sendOtpForReset({
        reset: updatedReset,
        otp,
      });
    } catch (error) {
      await PasswordReset.updateOne(
        {
          _id: updatedReset._id,

          otpHash: newOtpHash,

          lastOtpSentAt: now,
        },

        {
          $set: {
            otpHash: previousState.otpHash,

            otpExpiresAt: previousState.otpExpiresAt,

            lastOtpSentAt: previousState.lastOtpSentAt,

            resendCount: previousState.resendCount,

            failureReason: "OTP_RESEND_DELIVERY_FAILED",
          },
        },
      );

      return res.status(502).json({
        error: "PASSWORD_RESET_OTP_DELIVERY_FAILED",
      });
    }

    return res.status(200).json({
      message: "PASSWORD_RESET_OTP_RESENT",

      destination: getMaskedDestination(updatedReset),

      otpExpiresAt,

      resendAvailableAt: getResendAvailableAt(updatedReset),

      resendCount: updatedReset.resendCount,

      resendLimit: MAX_RESENDS,

      otpAttempts: updatedReset.otpAttempts,

      otpAttemptLimit: MAX_OTP_ATTEMPTS,
    });
  } catch (error) {
    console.error("Password reset OTP resend failed:", error);

    return res.status(500).json({
      error: "PASSWORD_RESET_OTP_RESEND_FAILED",
    });
  }
});

router.post("/verify", async (req, res) => {
  try {
    const { sessionToken, otp } = req.body;

    if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        error: "INVALID_OTP_FORMAT",
      });
    }

    const reset = await findResetBySessionToken(sessionToken);

    if (!reset) {
      return res.status(404).json({
        error: "PASSWORD_RESET_SESSION_NOT_FOUND",
      });
    }

    const now = new Date();

    if (reset.status === "completed") {
      return res.status(409).json({
        error: "PASSWORD_RESET_ALREADY_COMPLETED",
      });
    }

    if (!reset.isActive) {
      return res.status(410).json({
        error: "PASSWORD_RESET_SESSION_CLOSED",
      });
    }

    if (isResetSessionExpired(reset, now)) {
      await expireResetSession(reset);

      return res.status(410).json({
        error: "PASSWORD_RESET_SESSION_EXPIRED",
      });
    }

    if (reset.verificationStatus === "verified") {
      return res.status(409).json({
        error: "OTP_ALREADY_VERIFIED",

        canRetryDelivery: getResetStatusPayload(reset).canRetryDelivery,
      });
    }

    if (reset.otpAttempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({
        error: "OTP_ATTEMPTS_EXCEEDED",
      });
    }

    if (
      !reset.otpExpiresAt ||
      new Date(reset.otpExpiresAt).getTime() <= now.getTime()
    ) {
      return res.status(410).json({
        error: "OTP_EXPIRED",

        canResend: reset.resendCount < MAX_RESENDS,
      });
    }

    const otpMatches = verifyOtpHash({
      userId: reset.user.toString(),

      otp,

      storedHash: reset.otpHash,
    });

    if (!otpMatches) {
      const attemptedReset = await PasswordReset.findOneAndUpdate(
        {
          _id: reset._id,

          isActive: true,

          verificationStatus: "pending",

          otpAttempts: {
            $lt: MAX_OTP_ATTEMPTS,
          },
        },

        {
          $inc: {
            otpAttempts: 1,
          },
        },

        {
          new: true,
        },
      );

      if (!attemptedReset) {
        return res.status(409).json({
          error: "OTP_VERIFICATION_CONFLICT",
        });
      }

      if (attemptedReset.otpAttempts >= MAX_OTP_ATTEMPTS) {
        await PasswordReset.updateOne(
          {
            _id: attemptedReset._id,

            isActive: true,
          },

          {
            $set: {
              isActive: false,

              verificationStatus: "failed",

              status: "failed",

              failedAt: new Date(),

              failureReason: "OTP_ATTEMPTS_EXCEEDED",
            },
          },
        );

        return res.status(429).json({
          error: "OTP_ATTEMPTS_EXCEEDED",

          attemptsRemaining: 0,
        });
      }

      return res.status(400).json({
        error: "INVALID_OTP",

        attemptsRemaining: MAX_OTP_ATTEMPTS - attemptedReset.otpAttempts,
      });
    }

    const verifiedAt = new Date();

    const verifiedReset = await PasswordReset.findOneAndUpdate(
      {
        _id: reset._id,

        isActive: true,

        verificationStatus: "pending",

        otpHash: reset.otpHash,

        otpExpiresAt: {
          $gt: verifiedAt,
        },

        otpAttempts: {
          $lt: MAX_OTP_ATTEMPTS,
        },
      },

      {
        $set: {
          verificationStatus: "verified",

          verifiedAt,

          otpConsumedAt: verifiedAt,

          status: "verified",

          failureReason: "",
        },
      },

      {
        new: true,
      },
    );

    if (!verifiedReset) {
      return res.status(409).json({
        error: "OTP_VERIFICATION_CONFLICT",
      });
    }

    const user = await User.findById(verifiedReset.user);

    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const deliveryResult = await generateAndDeliverTemporaryPassword({
      reset: verifiedReset,
      user,
    });

    if (!deliveryResult.success) {
      return res.status(deliveryResult.status).json({
        error: deliveryResult.code,

        canRetryDelivery:
          deliveryResult.code === "TEMPORARY_PASSWORD_DELIVERY_FAILED" ||
          deliveryResult.code === "TEMPORARY_PASSWORD_UPDATE_FAILED",
      });
    }

    return res.status(200).json({
      message: "PASSWORD_RESET_COMPLETED",

      resetMethod: verifiedReset.resetMethod,

      destination: getMaskedDestination(verifiedReset),

      mustChangePassword: true,
    });
  } catch (error) {
    console.error("Password reset OTP verification failed:", error);

    return res.status(500).json({
      error: "PASSWORD_RESET_VERIFICATION_FAILED",
    });
  }
});

router.post("/retry-delivery", async (req, res) => {
  try {
    const { sessionToken } = req.body;

    const reset = await findResetBySessionToken(sessionToken);

    if (!reset) {
      return res.status(404).json({
        error: "PASSWORD_RESET_SESSION_NOT_FOUND",
      });
    }

    if (reset.status === "completed") {
      return res.status(409).json({
        error: "PASSWORD_RESET_ALREADY_COMPLETED",
      });
    }

    if (!reset.isActive) {
      return res.status(410).json({
        error: "PASSWORD_RESET_SESSION_CLOSED",
      });
    }

    if (isResetSessionExpired(reset)) {
      await expireResetSession(reset);

      return res.status(410).json({
        error: "PASSWORD_RESET_SESSION_EXPIRED",
      });
    }

    if (reset.verificationStatus !== "verified") {
      return res.status(403).json({
        error: "OTP_VERIFICATION_REQUIRED",
      });
    }

    if (reset.deliveryAttempts >= MAX_DELIVERY_ATTEMPTS) {
      return res.status(429).json({
        error: "PASSWORD_DELIVERY_ATTEMPTS_EXCEEDED",
      });
    }

    const user = await User.findById(reset.user);

    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const deliveryResult = await generateAndDeliverTemporaryPassword({
      reset,
      user,
    });

    if (!deliveryResult.success) {
      return res.status(deliveryResult.status).json({
        error: deliveryResult.code,

        canRetryDelivery:
          deliveryResult.code === "TEMPORARY_PASSWORD_DELIVERY_FAILED" ||
          deliveryResult.code === "TEMPORARY_PASSWORD_UPDATE_FAILED",
      });
    }

    const latestReset = await PasswordReset.findById(reset._id);

    return res.status(200).json({
      message: "TEMPORARY_PASSWORD_DELIVERED",

      destination: latestReset ? getMaskedDestination(latestReset) : "",

      mustChangePassword: true,
    });
  } catch (error) {
    console.error("Temporary password delivery retry failed:", error);

    return res.status(500).json({
      error: "PASSWORD_DELIVERY_RETRY_FAILED",
    });
  }
});

router.post("/change-password", verifyFirebaseToken, async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (typeof newPassword !== "string" || !newPassword) {
      return res.status(400).json({
        error: "NEW_PASSWORD_REQUIRED",
      });
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({
        error: "INVALID_NEW_PASSWORD_LENGTH",
      });
    }

    const user = await User.findOne({
      firebaseUid: req.firebaseUser.uid,
    });

    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    if (!user.mustChangePassword) {
      return res.status(409).json({
        error: "PASSWORD_CHANGE_NOT_REQUIRED",
      });
    }

    await setPermanentPassword({
      firebaseUid: user.firebaseUid,
      password: newPassword,
    });

    const passwordChangedAt = new Date();

    await User.updateOne(
      {
        _id: user._id,
      },
      {
        $set: {
          mustChangePassword: false,

          passwordChangedAt,
        },
      },
    );

    return res.status(200).json({
      message: "PASSWORD_CHANGED_SUCCESSFULLY",

      passwordChangedAt,

      signOutRequired: true,
    });
  } catch (error) {
    console.error("Permanent password update failed:", error);

    return res.status(500).json({
      error: "PASSWORD_CHANGE_FAILED",
    });
  }
});

router.post("/status", async (req, res) => {
  try {
    const { sessionToken } = req.body;

    const reset = await findResetBySessionToken(sessionToken);

    if (!reset) {
      return res.status(404).json({
        error: "PASSWORD_RESET_SESSION_NOT_FOUND",
      });
    }

    if (reset.isActive && isResetSessionExpired(reset)) {
      await expireResetSession(reset);

      const expiredReset = await PasswordReset.findById(reset._id);

      return res.status(200).json({
        reset: getResetStatusPayload(expiredReset),
      });
    }

    return res.status(200).json({
      reset: getResetStatusPayload(reset),
    });
  } catch (error) {
    console.error("Password reset status fetch failed:", error);

    return res.status(500).json({
      error: "PASSWORD_RESET_STATUS_FAILED",
    });
  }
});

router.get("/history", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({
      firebaseUid: req.firebaseUser.uid,
    });

    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const history = await PasswordReset.find({
      user: user._id,
    })
      .select(
        [
          "resetMethod",
          "destination",
          "preferredLanguage",
          "verificationStatus",
          "status",
          "otpAttempts",
          "resendCount",
          "deliveryStatus",
          "deliveryAttempts",
          "requestedAt",
          "nextRequestAllowedAt",
          "verifiedAt",
          "passwordUpdatedAt",
          "passwordDeliveredAt",
          "completedAt",
          "failedAt",
          "expiredAt",
          "failureReason",
          "ipAddress",
          "userAgent",
          "browser",
          "os",
          "device",
          "createdAt",
          "updatedAt",
        ].join(" "),
      )
      .sort({
        requestedAt: -1,
      })
      .lean();

    const sanitizedHistory = history.map((entry) => ({
      ...entry,

      destination:
        entry.resetMethod === "email"
          ? maskEmail(entry.destination)
          : maskPhoneNumber(entry.destination),
    }));

    return res.status(200).json({
      history: sanitizedHistory,
    });
  } catch (error) {
    console.error("Password reset history fetch failed:", error);

    return res.status(500).json({
      error: "PASSWORD_RESET_HISTORY_FAILED",
    });
  }
});

module.exports = router;
