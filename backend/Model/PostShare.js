const mongoose = require("mongoose");

const PostShareSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

PostShareSchema.index(
  {
    post: 1,
    user: 1,
  },
  {
    unique: true,
    name: "unique_post_share",
  },
);

PostShareSchema.index({
  user: 1,
  createdAt: -1,
});

module.exports = mongoose.model("PostShare", PostShareSchema);
