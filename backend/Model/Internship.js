const mongoose = require("mongoose");

const translatedInternshipSchema = new mongoose.Schema(
  {
    title: String,
    category: String,
    aboutCompany: String,
    aboutInternship: String,
    whoCanApply: String,
    perks: Array,
    duration: String,
    additionalInfo: String,
  },
  {
    _id: false,
  },
);

const InternshipSchema = new mongoose.Schema({
  title: String,

  company: String,

  location: String,

  category: String,

  aboutCompany: String,

  aboutInternship: String,

  whoCanApply: String,

  perks: Array,

  numberOfOpening: String,

  stipend: String,
  
  duration: String,

  startDate: String,

  additionalInfo: String,

  originalLanguage: {
    type: String,
    default: "en",
    enum: ["en"],
  },

  translations: {
    es: {
      type: translatedInternshipSchema,
      default: undefined,
    },

    hi: {
      type: translatedInternshipSchema,
      default: undefined,
    },

    pt: {
      type: translatedInternshipSchema,
      default: undefined,
    },

    zh: {
      type: translatedInternshipSchema,
      default: undefined,
    },

    fr: {
      type: translatedInternshipSchema,
      default: undefined,
    },
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Internship", InternshipSchema);
