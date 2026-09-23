const mongoose = require("mongoose");

const translatedJobSchema = new mongoose.Schema(
  {
    title: String,
    Experience: String,
    category: String,
    aboutCompany: String,
    aboutJob: String,
    whoCanApply: String,
    perks: Array,
    AdditionalInfo: String,
  },
  {
    _id: false,
  },
);

const JobSchema = new mongoose.Schema({
  title: String,

  company: String,

  location: String,

  Experience: String,

  category: String,

  aboutCompany: String,

  aboutJob: String,

  whoCanApply: String,

  perks: Array,

  AdditionalInfo: String,

  CTC: String,

  workFromHome: {
    type: Boolean,
    default: false,
  },

  partTime: {
    type: Boolean,
    default: false,
  },

  salary: {
    type: Number,
    default: 0,
  },

  StartDate: String,

  numberOfOpening: String,

  originalLanguage: {
    type: String,
    default: "en",
    enum: ["en"],
  },

  translations: {
    es: {
      type: translatedJobSchema,
      default: undefined,
    },

    hi: {
      type: translatedJobSchema,
      default: undefined,
    },

    pt: {
      type: translatedJobSchema,
      default: undefined,
    },

    zh: {
      type: translatedJobSchema,
      default: undefined,
    },

    fr: {
      type: translatedJobSchema,
      default: undefined,
    },
  },

  createAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Job", JobSchema);
