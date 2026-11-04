const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      default: "",
    },

    username: {
      type: String,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 24,
      match: /^[a-z0-9_]+$/,
    },

    email: {
      type: String,
      required: true,
    },

    photo: {
      type: String,
      default: "",
    },

    phoneNumber: {
      type: String,
      default: "",
    },

    preferredLanguage: {
      type: String,
      enum: ["en", "es", "hi", "pt", "zh", "fr"],
      default: "en",
    },

    friendCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    followerCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    followingCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    isPremium: {
      type: Boolean,
      default: false,
    },

    subscription: {
      plan: {
        type: String,
        enum: ["free", "bronze", "silver", "gold"],
        default: "free",
      },

      status: {
        type: String,
        enum: ["active", "cancelled", "expired"],
        default: "active",
      },

      applicationLimit: {
        type: Number,
        default: 1,
        min: 0,
      },

      applicationsUsed: {
        type: Number,
        default: 0,
        min: 0,
      },

      cycleStart: {
        type: Date,
        default: null,
      },

      cycleEnd: {
        type: Date,
        default: null,
      },

      cancelAtPeriodEnd: {
        type: Boolean,
        default: false,
      },

      scheduledPlan: {
        type: String,
        enum: ["free", "bronze", "silver", "gold"],
        default: null,
      },

      lastPayment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubscriptionPayment",
        default: null,
      },
    },

    resumes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Resume",
      },
    ],

    defaultResume: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resume",
      default: null,
    },

    mustChangePassword: {
      type: Boolean,
      default: false,
    },

    passwordChangedAt: {
      type: Date,
      default: null,
    },

    lastPasswordResetAt: {
      type: Date,
      default: null,
    },

    passwordResetAvailableAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

UserSchema.index(
  { phoneNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      phoneNumber: { $gt: "" },
    },
    name: "unique_non_empty_phone_number",
  },
);

UserSchema.index(
  { username: 1 },
  {
    unique: true,
    partialFilterExpression: {
      username: { $type: "string" },
    },
    name: "unique_username",
  },
);

UserSchema.index({
  name: 1,
});

module.exports = mongoose.model("User", UserSchema);
