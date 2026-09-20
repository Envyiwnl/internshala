const mongoose = require("mongoose");

const LanguageOtpSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    targetLanguage: {
      type: String,
      enum: ["fr"],
      default: "fr",
      required: true,
    },

    otpHash: {
      type: String,
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    requestCount: {
      type: Number,
      default: 1,
    },

    requestWindowStartedAt: {
      type: Date,
      required: true,
    },

    lastSentAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("LanguageOtp", LanguageOtpSchema);
