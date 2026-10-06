const mongoose = require("mongoose");

const PasswordResetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    firebaseUid: {
      type: String,
      required: true,
      index: true,
    },

    resetMethod: {
      type: String,
      enum: ["email", "phone"],
      required: true,
    },

    destination: {
      type: String,
      required: true,
    },

    preferredLanguage: {
      type: String,
      enum: ["en", "es", "hi", "pt", "zh", "fr"],
      default: "en",
    },

    sessionTokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    otpProvider: {
      type: String,
      enum: ["mailjet", "twilio_verify"],
      required: true,
    },

    otpHash: {
      type: String,
      default: "",
    },

    twilioVerificationSid: {
      type: String,
      default: "",
    },

    otpExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    otpAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    resendCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastOtpSentAt: {
      type: Date,
      required: true,
    },

    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "failed", "expired"],
      default: "pending",
      index: true,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },

    otpConsumedAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: [
        "otp_sent",
        "verified",
        "password_updated",
        "completed",
        "expired",
        "failed",
        "delivery_failed",
      ],
      default: "otp_sent",
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    passwordDeliveryMethod: {
      type: String,
      enum: ["email"],
      default: "email",
    },

    passwordDeliveryDestination: {
      type: String,
      default: "",
    },

    passwordUpdatedAt: {
      type: Date,
      default: null,
    },

    passwordDeliveredAt: {
      type: Date,
      default: null,
    },

    passwordGenerationCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    deliveryStatus: {
      type: String,
      enum: ["not_started", "pending", "sent", "failed"],
      default: "not_started",
    },

    deliveryAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastDeliveryAttemptAt: {
      type: Date,
      default: null,
    },

    requestedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    nextRequestAllowedAt: {
      type: Date,
      required: true,
      index: true,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    failedAt: {
      type: Date,
      default: null,
    },

    expiredAt: {
      type: Date,
      default: null,
    },

    failureReason: {
      type: String,
      default: "",
    },

    ipAddress: {
      type: String,
      default: "",
    },

    userAgent: {
      type: String,
      default: "",
    },

    browser: {
      name: {
        type: String,
        default: "",
      },

      version: {
        type: String,
        default: "",
      },
    },

    os: {
      name: {
        type: String,
        default: "",
      },

      version: {
        type: String,
        default: "",
      },
    },

    device: {
      type: {
        type: String,
        default: "desktop",
      },

      vendor: {
        type: String,
        default: "",
      },

      model: {
        type: String,
        default: "",
      },
    },
  },
  {
    timestamps: true,
  },
);

PasswordResetSchema.index(
  {
    user: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
    },
    name: "one_active_password_reset_per_user",
  },
);

PasswordResetSchema.index({
  user: 1,
  requestedAt: -1,
});

PasswordResetSchema.index({
  status: 1,
  requestedAt: -1,
});

module.exports = mongoose.model("PasswordReset", PasswordResetSchema);
