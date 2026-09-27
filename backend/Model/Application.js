const mongoose = require("mongoose");

const Applicationipschema = new mongoose.Schema({
  company: String,

  category: String,

  coverLetter: String,

  availability: {
    type: String,
    default: "",
  },

  user: Object,

  createdAt: {
    type: Date,
    default: Date.now,
  },

  status: {
    type: String,
    enum: ["accepted", "pending", "rejected"],
    default: "pending",
  },

  Application: Object,

  resume: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Resume",
    default: null,
  },

  resumeVersionNumber: {
    type: Number,
    default: null,
  },
});

module.exports = mongoose.model("Application", Applicationipschema);
