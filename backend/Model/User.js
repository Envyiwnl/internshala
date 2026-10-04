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

    isPremium: {
      type: Boolean,
      default: false,
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

module.exports = mongoose.model("User", UserSchema);
