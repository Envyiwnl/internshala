const mongoose = require("mongoose");

const LoginActivitySchema = new mongoose.Schema(
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

    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },

    startRequestHash: {
      type: String,
      select: false,
    },

    loginStatus: {
      type: String,
      enum: ["pending", "otp_pending", "success", "rejected", "failed"],
      default: "pending",
      index: true,
    },

    failureReason: {
      type: String,
      default: "",
    },

    loginAt: {
      type: Date,
      default: Date.now,
      index: true,
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
        enum: ["desktop", "laptop", "tablet", "mobile", "unknown"],
        default: "unknown",
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

    location: {
      city: {
        type: String,
        default: "",
      },

      region: {
        type: String,
        default: "",
      },

      country: {
        type: String,
        default: "",
      },

      countryCode: {
        type: String,
        default: "",
      },

      latitude: {
        type: Number,
        default: null,
      },

      longitude: {
        type: Number,
        default: null,
      },

      timezone: {
        type: String,
        default: "",
      },
    },

    environment: {
      browserKey: {
        type: String,
        default: "",
      },

      deviceKey: {
        type: String,
        default: "",
      },

      isNewBrowser: {
        type: Boolean,
        default: false,
      },

      isNewDevice: {
        type: Boolean,
        default: false,
      },

      isNewIp: {
        type: Boolean,
        default: false,
      },

      trusted: {
        type: Boolean,
        default: false,
      },
    },

    challenge: {
      tokenHash: {
        type: String,
        default: "",
        select: false,
      },

      status: {
        type: String,
        enum: ["none", "pending", "consumed", "expired"],
        default: "none",
      },

      expiresAt: {
        type: Date,
        default: null,
      },

      consumedAt: {
        type: Date,
        default: null,
      },
    },

    verification: {
      required: {
        type: Boolean,
        default: false,
      },

      method: {
        type: String,
        enum: ["none", "email_otp"],
        default: "none",
      },

      status: {
        type: String,
        enum: ["not_required", "pending", "verified", "failed", "expired"],
        default: "not_required",
      },

      otpHash: {
        type: String,
        default: "",
        select: false,
      },

      lastFailedOtpHash: {
        type: String,
        default: "",
        select: false,
      },

      otpExpiresAt: {
        type: Date,
        default: null,
      },

      attempts: {
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
        default: null,
      },

      verifiedAt: {
        type: Date,
        default: null,
      },
    },

    session: {
      tokenHash: {
        type: String,
        default: "",
        select: false,
      },

      status: {
        type: String,
        enum: ["none", "pending", "active", "revoked", "expired"],
        default: "none",
        index: true,
      },

      createdAt: {
        type: Date,
        default: null,
      },

      lastSeenAt: {
        type: Date,
        default: null,
      },

      expiresAt: {
        type: Date,
        default: null,
      },

      revokedAt: {
        type: Date,
        default: null,
      },

      revokedReason: {
        type: String,
        default: "",
      },
    },
  },
  {
    timestamps: true,
  },
);

LoginActivitySchema.index({
  user: 1,
  loginAt: -1,
});

LoginActivitySchema.index({
  user: 1,
  "session.status": 1,
  loginAt: -1,
});

LoginActivitySchema.index({
  user: 1,
  ipAddress: 1,
});

LoginActivitySchema.index({
  user: 1,
  "environment.browserKey": 1,
});

LoginActivitySchema.index({
  user: 1,
  "environment.deviceKey": 1,
});

LoginActivitySchema.index({
  "session.tokenHash": 1,
});

LoginActivitySchema.index(
  {
    user: 1,
    startRequestHash: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      startRequestHash: {
        $exists: true,
      },
    },
  },
);

module.exports = mongoose.model("LoginActivity", LoginActivitySchema);
