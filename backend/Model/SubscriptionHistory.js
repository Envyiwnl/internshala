const mongoose = require("mongoose");

const SubscriptionHistorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    action: {
      type: String,
      enum: [
        "activated",
        "upgraded",
        "downgraded",
        "renewed",
        "cancelled",
        "expired",
      ],
      required: true,
    },

    previousPlan: {
      type: String,
      enum: ["free", "bronze", "silver", "gold"],
      required: true,
    },

    newPlan: {
      type: String,
      enum: ["free", "bronze", "silver", "gold"],
      required: true,
    },

    subscriptionStart: {
      type: Date,
      default: null,
    },

    subscriptionEnd: {
      type: Date,
      default: null,
    },

    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPayment",
      default: null,
    },

    reason: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

SubscriptionHistorySchema.index({ user: 1, createdAt: -1 });

SubscriptionHistorySchema.index(
  { payment: 1 },
  {
    unique: true,
    partialFilterExpression: {
      payment: { $type: "objectId" },
    },
  },
);

module.exports = mongoose.model(
  "SubscriptionHistory",
  SubscriptionHistorySchema,
);
