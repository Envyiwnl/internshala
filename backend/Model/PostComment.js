const mongoose = require("mongoose");

const PostCommentSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    text: {
      type: String,
      required: true,
      trim: true,
    },

    editedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

PostCommentSchema.index({
  post: 1,
  createdAt: -1,
});

PostCommentSchema.index({
  author: 1,
  createdAt: -1,
});

module.exports = mongoose.model("PostComment", PostCommentSchema);
