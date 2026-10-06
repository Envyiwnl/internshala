const mongoose = require("mongoose");

const FollowSchema = new mongoose.Schema(
  {
    follower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    following: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

FollowSchema.index(
  {
    follower: 1,
    following: 1,
  },
  {
    unique: true,
    name: "unique_follow_relationship",
  },
);

FollowSchema.index({
  following: 1,
  createdAt: -1,
});

FollowSchema.index({
  follower: 1,
  createdAt: -1,
});

module.exports = mongoose.model("Follow", FollowSchema);
