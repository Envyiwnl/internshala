const User = require("../Model/User");

const requirePremium = async (req, res, next) => {
  try {
    const user = await User.findOne({
      firebaseUid: req.firebaseUser.uid,
    });

    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    if (!user.isPremium) {
      return res.status(403).json({
        error: "PREMIUM_REQUIRED",
      });
    }

    req.dbUser = user;

    next();
  } catch (error) {
    console.error("Premium verification failed:", error);

    return res.status(500).json({
      error: "PREMIUM_VERIFICATION_FAILED",
    });
  }
};

module.exports = requirePremium;
