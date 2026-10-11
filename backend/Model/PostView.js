const mongoose = require("mongoose");

const PostViewSchema = new mongoose.Schema(
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

PostViewSchema.index(
  {
    post: 1,
    user: 1,
  },
  {
    unique: true,
    name: "unique_post_view",
  },
);

PostViewSchema.index({
  user: 1,
  createdAt: -1,
});

module.exports = mongoose.model("PostView", PostViewSchema);
