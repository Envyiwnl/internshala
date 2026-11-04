const mongoose = require("mongoose");

const SubscriptionPaymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    plan: {
      type: String,
      enum: ["bronze", "silver", "gold"],
      required: true,
    },

    action: {
      type: String,
      enum: ["purchase", "upgrade", "downgrade", "renewal"],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
      enum: ["INR"],
    },

    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
    },

    razorpayPaymentId: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["created", "paid", "failed", "cancelled"],
      default: "created",
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

    subscriptionStart: {
      type: Date,
      default: null,
    },

    subscriptionEnd: {
      type: Date,
      default: null,
    },

    invoiceNumber: {
      type: String,
      default: "",
    },

    billingDetails: {
      name: { type: String, default: "" },
      email: { type: String, default: "" },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      postalCode: { type: String, default: "" },
      country: { type: String, default: "India" },
    },

    confirmationEmailSentAt: {
      type: Date,
      default: null,
    },

    testMode: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

SubscriptionPaymentSchema.index(
  { razorpayPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      razorpayPaymentId: { $gt: "" },
    },
  },
);

SubscriptionPaymentSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model(
  "SubscriptionPayment",
  SubscriptionPaymentSchema,
);
