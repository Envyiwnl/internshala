const express = require("express");

const router = express.Router();

const Application = require("../Model/Application");
const User = require("../Model/User");
const Resume = require("../Model/Resume");
const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");

router.post("/", verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({
      firebaseUid: req.firebaseUser.uid,
    });

    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    let resumeId = null;
    let resumeVersionNumber = null;

    if (user.defaultResume) {
      const resume = await Resume.findOne({
        _id: user.defaultResume,
        user: user._id,
      });

      if (!resume) {
        return res.status(409).json({
          error: "DEFAULT_RESUME_NOT_FOUND",
        });
      }

      if (
        resume.status !== "generated" ||
        resume.currentVersion < 1 ||
        resume.versions.length === 0
      ) {
        return res.status(409).json({
          error: "DEFAULT_RESUME_NOT_GENERATED",
        });
      }

      const version = resume.versions.find(
        (item) => item.versionNumber === resume.currentVersion,
      );

      if (!version || !version.pdfFileId) {
        return res.status(409).json({
          error: "DEFAULT_RESUME_VERSION_NOT_AVAILABLE",
        });
      }

      resumeId = resume._id;
      resumeVersionNumber = version.versionNumber;
    }

    const applicationData = await Application.create({
      company: req.body.company,

      category: req.body.category,

      coverLetter: req.body.coverLetter,

      user: {
        uid: req.firebaseUser.uid,
        name: req.firebaseUser.name || "",
        email: req.firebaseUser.email || "",
        photo: req.firebaseUser.picture || "",
      },

      Application: req.body.Application,

      resume: resumeId,

      availability: req.body.availability,

      resumeVersionNumber,
    });

    return res.status(201).json(applicationData);
  } catch (error) {
    console.error("Application submission failed:", error);

    return res.status(500).json({
      error: "APPLICATION_SUBMISSION_FAILED",
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const data = await Application.find();

    return res.status(200).json(data);
  } catch (error) {
    console.error("Application fetch failed:", error);

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
    });
  }
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const data = await Application.findById(id);

    if (!data) {
      return res.status(404).json({
        error: "APPLICATION_NOT_FOUND",
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Application fetch failed:", error);

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
    });
  }
});

router.put("/:id", async (req, res) => {
  const { id } = req.params;

  const { action } = req.body;

  let status;

  if (action === "accepted") {
    status = "accepted";
  } else if (action === "rejected") {
    status = "rejected";
  } else {
    return res.status(400).json({
      error: "INVALID_ACTION",
    });
  }

  try {
    const updatedApplication = await Application.findByIdAndUpdate(
      id,
      {
        $set: {
          status,
        },
      },
      {
        new: true,
      },
    );

    if (!updatedApplication) {
      return res.status(404).json({
        error: "APPLICATION_NOT_FOUND",
      });
    }

    return res.status(200).json({
      success: true,
      data: updatedApplication,
    });
  } catch (error) {
    console.error("Application update failed:", error);

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
    });
  }
});

module.exports = router;
