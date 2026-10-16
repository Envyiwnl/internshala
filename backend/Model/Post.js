const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    text: {
      type: String,
      default: "",
      trim: true,
    },

    privacy: {
      type: String,
      enum: ["public", "friends", "followers", "private"],
      default: "public",
      index: true,
    },

    friendCountAtPosting: {
      type: Number,
      required: true,
      min: 0,
    },

    contentHash: {
      type: String,
      default: null,
      select: false,
    },

    editedAt: {
      type: Date,
      default: null,
    },

    hashtags: {
      type: [String],
      default: [],
    },

    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    media: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MediaAsset",
      default: null,
    },

    likeCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    commentCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    shareCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    saveCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    reportCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

PostSchema.index({
  author: 1,
  createdAt: -1,
});

PostSchema.index({
  privacy: 1,
  createdAt: -1,
});

PostSchema.index({
  author: 1,
  contentHash: 1,
  createdAt: -1,
});

PostSchema.index({ hashtags: 1, createdAt: -1 });
PostSchema.index({ mentions: 1, createdAt: -1 });

module.exports = mongoose.model("Post", PostSchema);
