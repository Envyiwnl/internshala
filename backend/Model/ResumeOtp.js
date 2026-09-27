const mongoose = require("mongoose");

const ResumeOtpSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    resume: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resume",
      default: null,
      index: true,
    },

    purpose: {
      type: String,
      enum: ["resume-payment"],
      default: "resume-payment",
    },

    otpHash: {
      type: String,
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
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

    verifiedAt: {
      type: Date,
      default: null,
    },

    verifiedUntil: {
      type: Date,
      default: null,
    },

    consumedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("ResumeOtp", ResumeOtpSchema);
