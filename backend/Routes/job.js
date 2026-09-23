const express = require("express");

const router = express.Router();

const Job = require("../Model/Job");

const { translateJobContent } = require("../services/translationService");

router.post("/", async (req, res) => {
  try {
    let translations = {};

    try {
      translations = await translateJobContent(req.body);
    } catch (translationError) {
      console.error("Job translation failed:", translationError);

      translations = {};
    }

    const jobdata = new Job({
      title: req.body.title,

      company: req.body.company,

      location: req.body.location,

      Experience: req.body.Experience,

      category: req.body.category,

      aboutCompany: req.body.aboutCompany,

      aboutJob: req.body.aboutJob,

      whoCanApply: req.body.whoCanApply,

      perks: req.body.perks,

      AdditionalInfo: req.body.AdditionalInfo,

      CTC: req.body.CTC,

      salary: req.body.salary,

      workFromHome: req.body.workFromHome,

      partTime: req.body.partTime,

      StartDate: req.body.StartDate,

      numberOfOpening: req.body.numberOfOpening,

      originalLanguage: "en",

      translations,
    });

    const data = await jobdata.save();

    return res.status(201).json(data);
  } catch (error) {
    console.error("Failed to create job:", error);

    return res.status(500).json({
      error: "internal server error",
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const data = await Job.find();

    return res.status(200).json(data);
  } catch (error) {
    console.error("Failed to fetch jobs:", error);

    return res.status(500).json({
      error: "internal server error",
    });
  }
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const data = await Job.findById(id);

    if (!data) {
      return res.status(404).json({
        error: "Job not found",
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Failed to fetch job:", error);

    return res.status(500).json({
      error: "internal server error",
    });
  }
});

module.exports = router;
