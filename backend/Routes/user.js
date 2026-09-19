const express = require("express");
const router = express.Router();

const User = require("../Model/User");
const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");

router.post("/sync", verifyFirebaseToken, async (req, res) => {
  try {
    const firebaseUser = req.firebaseUser;

    const allowedInitialLanguages = ["en", "es", "hi", "pt", "zh"];

    const requestedLanguage = req.body.preferredLanguage;

    const initialLanguage = allowedInitialLanguages.includes(requestedLanguage)
      ? requestedLanguage
      : "en";

    const user = await User.findOneAndUpdate(
      {
        firebaseUid: firebaseUser.uid,
      },
      {
        $set: {
          name: firebaseUser.name || "",
          email: firebaseUser.email || "",
          photo: firebaseUser.picture || "",
          phoneNumber: firebaseUser.phone_number || "",
        },

        $setOnInsert: {
          preferredLanguage: initialLanguage,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.status(200).json({
      user,
    });
  } catch (error) {
    console.error("User sync failed:", error);

    return res.status(500).json({
      error: "USER_SYNC_FAILED",
    });
  }
});

module.exports = router;
