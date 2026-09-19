const { getAuth } = require("firebase-admin/auth");

require("../firebaseAdmin");

const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
      });
    }

    const token = authHeader.split("Bearer ")[1];

    const decodedToken = await getAuth().verifyIdToken(token);

    req.firebaseUser = decodedToken;

    next();
  } catch (error) {
    console.error("Firebase token verification failed:", error);

    return res.status(401).json({
      error: "INVALID_TOKEN",
    });
  }
};

module.exports = verifyFirebaseToken;
