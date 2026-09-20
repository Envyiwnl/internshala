const express = require("express");
const crypto = require("node:crypto");

const LanguageOtp = require("../Model/LanguageOtp");

const { sendFrenchLanguageOtp } = require("../services/emailService");

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

const hashOtp = (userId, otp) => {
  return crypto
    .createHmac("sha256", process.env.OTP_HASH_SECRET)
    .update(`${userId}:${otp}`)
    .digest("hex");
};

const User = require("../Model/User");
const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");

const router = express.Router();

const supportedLanguages = ["en", "es", "hi", "pt", "zh", "fr"];

router.put("/", verifyFirebaseToken, async (req, res) => {
  try {
    const { language } = req.body;

    if (!supportedLanguages.includes(language)) {
      return res.status(400).json({
        error: "UNSUPPORTED_LANGUAGE",
      });
    }

    if (language === "fr") {
      return res.status(403).json({
        error: "FRENCH_REQUIRES_OTP",
      });
    }

    const user = await User.findOneAndUpdate(
      {
        firebaseUid: req.firebaseUser.uid,
      },

      {
        $set: {
          preferredLanguage: language,
        },
      },

      {
        new: true,
      },
    );

    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    return res.status(200).json({
      preferredLanguage: user.preferredLanguage,
    });
  } catch (error) {
    console.error("Language update failed:", error);

    return res.status(500).json({
      error: "LANGUAGE_UPDATE_FAILED",
    });
  }
});

router.post("/french/request-otp", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({
      firebaseUid: req.firebaseUser.uid,
    });

    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    if (!user.email) {
      return res.status(400).json({
        error: "EMAIL_NOT_AVAILABLE",
      });
    }

    const now = new Date();

    const existingOtp = await LanguageOtp.findOne({
      user: user._id,
    });

    if (existingOtp?.lastSentAt) {
      const timeSinceLastRequest =
        now.getTime() - existingOtp.lastSentAt.getTime();

      if (timeSinceLastRequest < OTP_COOLDOWN_MS) {
        const retryAfter = Math.ceil(
          (OTP_COOLDOWN_MS - timeSinceLastRequest) / 1000,
        );

        return res.status(429).json({
          error: "OTP_RESEND_TOO_SOON",
          retryAfter,
        });
      }
    }

    let requestCount = 1;
    let requestWindowStartedAt = now;

    if (existingOtp?.requestWindowStartedAt) {
      const windowAge =
        now.getTime() - existingOtp.requestWindowStartedAt.getTime();

      if (windowAge < REQUEST_WINDOW_MS) {
        if (existingOtp.requestCount >= MAX_REQUESTS_PER_WINDOW) {
          return res.status(429).json({
            error: "OTP_REQUEST_LIMIT_REACHED",
          });
        }

        requestCount = existingOtp.requestCount + 1;

        requestWindowStartedAt = existingOtp.requestWindowStartedAt;
      }
    }

    const otp = crypto.randomInt(100000, 1000000).toString();

    const otpHash = hashOtp(user._id.toString(), otp);

    const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);

    await sendFrenchLanguageOtp({
      email: user.email,
      otp,
    });

    await LanguageOtp.findOneAndUpdate(
      {
        user: user._id,
      },
      {
        $set: {
          targetLanguage: "fr",
          otpHash,
          expiresAt,
          attempts: 0,
          requestCount,
          requestWindowStartedAt,
          lastSentAt: now,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.status(200).json({
      message: "OTP_SENT",
      expiresIn: 600,
    });
  } catch (error) {
    console.error("French OTP request failed:", error);

    return res.status(500).json({
      error: "OTP_SEND_FAILED",
    });
  }
});

router.post("/french/verify-otp", verifyFirebaseToken, async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        error: "INVALID_OTP_FORMAT",
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

    const otpRecord = await LanguageOtp.findOne({
      user: user._id,
    });

    if (!otpRecord) {
      return res.status(400).json({
        error: "OTP_NOT_FOUND",
      });
    }

    if (otpRecord.expiresAt.getTime() < Date.now()) {
      await LanguageOtp.deleteOne({
        _id: otpRecord._id,
      });

      return res.status(400).json({
        error: "OTP_EXPIRED",
      });
    }

    if (otpRecord.attempts >= 5) {
      return res.status(429).json({
        error: "OTP_TOO_MANY_ATTEMPTS",
      });
    }

    const submittedHash = hashOtp(user._id.toString(), otp);

    const storedBuffer = Buffer.from(otpRecord.otpHash, "hex");

    const submittedBuffer = Buffer.from(submittedHash, "hex");

    const isValid =
      storedBuffer.length === submittedBuffer.length &&
      crypto.timingSafeEqual(storedBuffer, submittedBuffer);

    if (!isValid) {
      otpRecord.attempts += 1;

      await otpRecord.save();

      const attemptsLeft = 5 - otpRecord.attempts;

      if (attemptsLeft <= 0) {
        return res.status(429).json({
          error: "OTP_TOO_MANY_ATTEMPTS",
        });
      }

      return res.status(400).json({
        error: "INVALID_OTP",
        attemptsLeft,
      });
    }

    user.preferredLanguage = "fr";
    await user.save();

    // OTP must never be reusable.
    await LanguageOtp.deleteOne({
      _id: otpRecord._id,
    });

    return res.status(200).json({
      message: "OTP_VERIFIED",
      preferredLanguage: "fr",
    });
  } catch (error) {
    console.error("French OTP verification failed:", error);

    return res.status(500).json({
      error: "OTP_VERIFICATION_FAILED",
    });
  }
});

module.exports = router;
