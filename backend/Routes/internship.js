const express = require("express");

const router = express.Router();

const Internship = require("../Model/Internship");

const {
  translateInternshipContent,
} = require("../services/translationService");

router.post("/", async (req, res) => {
  try {
    let translations = {};

    try {
      translations = await translateInternshipContent(req.body);
    } catch (translationError) {
      console.error("Internship translation failed:", translationError);

      translations = {};
    }

    const Internshipdata = new Internship({
      title: req.body.title,

      company: req.body.company,

      location: req.body.location,

      category: req.body.category,

      aboutCompany: req.body.aboutCompany,

      aboutInternship: req.body.aboutInternship,

      whoCanApply: req.body.whoCanApply,

      perks: req.body.perks,

      numberOfOpening: req.body.numberOfOpening,

      stipend: req.body.stipend,

      duration: req.body.duration,

      startDate: req.body.startDate,

      additionalInfo: req.body.additionalInfo,

      originalLanguage: "en",

      translations,
    });

    const data = await Internshipdata.save();

    return res.status(201).json(data);
  } catch (error) {
    console.error("Failed to create internship:", error);

    return res.status(500).json({
      error: "internal server error",
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const data = await Internship.find();

    return res.status(200).json(data);
  } catch (error) {
    console.error("Failed to fetch internships:", error);

    return res.status(500).json({
      error: "internal server error",
    });
  }
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const data = await Internship.findById(id);

    if (!data) {
      return res.status(404).json({
        error: "internship not found",
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Failed to fetch internship:", error);

    return res.status(500).json({
      error: "internal server error",
    });
  }
});

module.exports = router;
