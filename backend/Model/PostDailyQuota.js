const mongoose = require("mongoose");

const PostDailyQuotaSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    dateKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    postsUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

PostDailyQuotaSchema.index(
  {
    user: 1,
    dateKey: 1,
  },
  {
    unique: true,
    name: "unique_user_daily_post_quota",
  },
);

module.exports = mongoose.model("PostDailyQuota", PostDailyQuotaSchema);
