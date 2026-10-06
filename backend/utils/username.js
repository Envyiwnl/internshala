const User = require("../Model/User");

const MAX_USERNAME_LENGTH = 24;

const sanitizeUsername = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_USERNAME_LENGTH);
};

const buildBaseUsername = (user) => {
  const emailName =
    typeof user.email === "string" ? user.email.split("@")[0] : "";

  const source =
    user.name || emailName || `user_${user._id.toString().slice(-8)}`;

  let base = sanitizeUsername(source);

  if (base.length < 3) {
    base = `user_${user._id.toString().slice(-8)}`;
  }

  return base.slice(0, MAX_USERNAME_LENGTH);
};

const buildCandidate = (base, attempt) => {
  if (attempt === 0) {
    return base;
  }

  const suffix = String(attempt + 1);

  const allowedBaseLength = MAX_USERNAME_LENGTH - suffix.length;

  const trimmedBase = base.slice(0, allowedBaseLength).replace(/_+$/g, "");

  return `${trimmedBase}${suffix}`;
};

const ensureUserUsername = async (user) => {
  if (!user) {
    return null;
  }

  if (user.username) {
    return user;
  }

  const base = buildBaseUsername(user);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = buildCandidate(base, attempt);

    try {
      const updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,

          $or: [
            {
              username: {
                $exists: false,
              },
            },
            {
              username: null,
            },
            {
              username: "",
            },
          ],
        },
        {
          $set: {
            username: candidate,
          },
        },
        {
          new: true,
        },
      );

      if (updatedUser) {
        return updatedUser;
      }

      const currentUser = await User.findById(user._id);

      if (currentUser?.username) {
        return currentUser;
      }
    } catch (error) {
      if (error?.code === 11000) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("USERNAME_GENERATION_FAILED");
};

module.exports = {
  sanitizeUsername,
  ensureUserUsername,
};
