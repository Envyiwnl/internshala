const express = require("express");

const User = require("../Model/User");
const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");

const router = express.Router();

const supportedLanguages = ["en", "es", "hi", "pt", "zh", "fr"];

router.put("/", verifyFirebaseToken, async (req, res) => {
  try {
    const { language } = req.body;

    if (!supportedLanguages.includes(language)) {
      return res.status(400).json({
        error: "UNSUPPORTED_LANGUAGE",
      });
    }

    if (language === "fr") {
      return res.status(403).json({
        error: "FRENCH_REQUIRES_OTP",
      });
    }

    const user = await User.findOneAndUpdate(
      {
        firebaseUid: req.firebaseUser.uid,
      },

      {
        $set: {
          preferredLanguage: language,
        },
      },

      {
        new: true,
      },
    );

    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    return res.status(200).json({
      preferredLanguage: user.preferredLanguage,
    });
  } catch (error) {
    console.error("Language update failed:", error);

    return res.status(500).json({
      error: "LANGUAGE_UPDATE_FAILED",
    });
  }
});

module.exports = router;
