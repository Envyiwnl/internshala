const mongoose = require("mongoose");

const LanguageHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  previousLanguage: {
    type: String,
    required: true,
  },

  selectedLanguage: {
    type: String,
    required: true,
  },

  verificationMethod: {
    type: String,
    enum: ["standard", "email-otp"],
    required: true,
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

  changedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

module.exports = mongoose.model("LanguageHistory", LanguageHistorySchema);
