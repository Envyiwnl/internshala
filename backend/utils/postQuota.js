const PostDailyQuota = require("../Model/PostDailyQuota");

const getPostLimit = (friendCount) => {
  const count = Math.max(Number(friendCount) || 0, 0);

  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 5;

  return null;
};

const getUtcDateKey = (date = new Date()) => {
  return date.toISOString().slice(0, 10);
};

const reservePostQuota = async ({ userId, friendCount }) => {
  const limit = getPostLimit(friendCount);
  const dateKey = getUtcDateKey();

  if (limit === 0) {
    return {
      allowed: false,
      limit,
      postsUsed: 0,
      dateKey,
    };
  }

  const filter = {
    user: userId,
    dateKey,
  };

  if (limit !== null) {
    filter.postsUsed = {
      $lt: limit,
    };
  }

  const updateQuota = () =>
    PostDailyQuota.findOneAndUpdate(
      filter,
      {
        $inc: {
          postsUsed: 1,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

  try {
    const quota = await updateQuota();

    return {
      allowed: true,
      limit,
      postsUsed: quota.postsUsed,
      dateKey,
    };
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    try {
      const quota = await updateQuota();

      return {
        allowed: true,
        limit,
        postsUsed: quota.postsUsed,
        dateKey,
      };
    } catch (retryError) {
      if (retryError?.code !== 11000) {
        throw retryError;
      }

      const existingQuota = await PostDailyQuota.findOne({
        user: userId,
        dateKey,
      }).lean();

      return {
        allowed: false,
        limit,
        postsUsed: existingQuota?.postsUsed || 0,
        dateKey,
      };
    }
  }
};

const releasePostQuota = async ({ userId, dateKey }) => {
  await PostDailyQuota.updateOne(
    {
      user: userId,
      dateKey,
      postsUsed: {
        $gt: 0,
      },
    },
    {
      $inc: {
        postsUsed: -1,
      },
    },
  );
};

module.exports = {
  getPostLimit,
  getUtcDateKey,
  reservePostQuota,
  releasePostQuota,
};
