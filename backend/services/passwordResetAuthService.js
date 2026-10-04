const { getAuth } = require("firebase-admin/auth");

require("../firebaseAdmin");

const getFirebaseUser = async (firebaseUid) => {
  if (!firebaseUid) {
    throw new Error("FIREBASE_UID_REQUIRED");
  }

  try {
    return await getAuth().getUser(firebaseUid);
  } catch (error) {
    console.error("Firebase user lookup failed:", error.code || error.message);

    throw new Error("FIREBASE_USER_LOOKUP_FAILED");
  }
};

const setTemporaryPassword = async ({ firebaseUid, password }) => {
  if (!firebaseUid || !password) {
    throw new Error("TEMPORARY_PASSWORD_INPUT_MISSING");
  }

  try {
    await getAuth().updateUser(firebaseUid, {
      password,
    });

    await getAuth().revokeRefreshTokens(firebaseUid);

    return true;
  } catch (error) {
    console.error(
      "Firebase temporary password update failed:",
      error.code || error.message,
    );

    throw new Error("TEMPORARY_PASSWORD_UPDATE_FAILED");
  }
};

const setPermanentPassword = async ({ firebaseUid, password }) => {
  if (!firebaseUid || !password) {
    throw new Error("PERMANENT_PASSWORD_INPUT_MISSING");
  }

  try {
    await getAuth().updateUser(firebaseUid, {
      password,
    });

    await getAuth().revokeRefreshTokens(firebaseUid);

    return true;
  } catch (error) {
    console.error(
      "Firebase permanent password update failed:",
      error.code || error.message,
    );

    throw new Error("PERMANENT_PASSWORD_UPDATE_FAILED");
  }
};

module.exports = {
  getFirebaseUser,
  setTemporaryPassword,
  setPermanentPassword,
};
