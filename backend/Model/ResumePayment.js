const mongoose = require("mongoose");

const ResumePaymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    resume: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resume",
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      default: 5000,
      required: true,
    },

    currency: {
      type: String,
      default: "INR",
    },

    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    razorpayPaymentId: {
      type: String,
      default: "",
      index: true,
    },

    razorpaySignature: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["created", "paid", "failed", "cancelled"],
      default: "created",
    },

    otpVerified: {
      type: Boolean,
      default: false,
    },

    otpVerifiedAt: {
      type: Date,
      default: null,
    },

    versionNumber: {
      type: Number,
      default: null,
    },

    generationStatus: {
      type: String,
      enum: ["pending", "generating", "generated", "failed"],
      default: "pending",
    },

    generationStartedAt: {
      type: Date,
      default: null,
    },

    invoiceNumber: {
      type: String,
      default: "",
      index: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    failedAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    failureReason: {
      type: String,
      default: "",
    },

    testMode: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("ResumePayment", ResumePaymentSchema);
