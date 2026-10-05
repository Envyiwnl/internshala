const express = require("express");
const router = express.Router();

const User = require("../Model/User");
const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");

const normalizePhoneNumber = (phoneNumber) => {
  if (typeof phoneNumber !== "string") {
    return "";
  }

  return phoneNumber.replace(/[\s()-]/g, "").trim();
};

const isValidPhoneNumber = (phoneNumber) => {
  return /^\+[1-9]\d{7,14}$/.test(phoneNumber);
};

router.post("/sync", verifyFirebaseToken, async (req, res) => {
  try {
    const firebaseUser = req.firebaseUser;

    const allowedInitialLanguages = ["en", "es", "hi", "pt", "zh"];

    const requestedLanguage = req.body?.preferredLanguage;

    const initialLanguage = allowedInitialLanguages.includes(requestedLanguage)
      ? requestedLanguage
      : "en";

    const firebasePhoneNumber = normalizePhoneNumber(
      firebaseUser.phone_number || "",
    );

    const requestedPhoneNumber = normalizePhoneNumber(
      req.body?.phoneNumber || "",
    );

    if (requestedPhoneNumber && !isValidPhoneNumber(requestedPhoneNumber)) {
      return res.status(400).json({
        error: "INVALID_PHONE_NUMBER",
      });
    }

    const fieldsToUpdate = {
      name: firebaseUser.name || "",
      email: firebaseUser.email || "",
      photo: firebaseUser.picture || "",
    };

    if (firebasePhoneNumber) {
      fieldsToUpdate.phoneNumber = firebasePhoneNumber;
    } else if (requestedPhoneNumber) {
      fieldsToUpdate.phoneNumber = requestedPhoneNumber;
    }

    const user = await User.findOneAndUpdate(
      {
        firebaseUid: firebaseUser.uid,
      },
      {
        $set: fieldsToUpdate,

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
    if (
      error?.code === 11000 &&
      (error?.keyPattern?.phoneNumber || error?.keyValue?.phoneNumber)
    ) {
      return res.status(409).json({
        error: "PHONE_NUMBER_ALREADY_IN_USE",
      });
    }

    console.error("User sync failed:", error);

    return res.status(500).json({
      error: "USER_SYNC_FAILED",
    });
  }
});

module.exports = router;
