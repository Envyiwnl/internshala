const mongoose = require("mongoose");

const MediaAssetSchema = new mongoose.Schema(
  {
    uploader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null,
      index: true,
    },

    resourceType: {
      type: String,
      enum: ["image", "video"],
      required: true,
    },

    mimeType: {
      type: String,
      required: true,
      trim: true,
    },

    contentHash: {
      type: String,
      required: true,
      select: false,
    },

    cloudinaryPublicId: {
      type: String,
      required: true,
      unique: true,
    },

    secureUrl: {
      type: String,
      required: true,
    },

    format: {
      type: String,
      default: "",
    },

    bytes: {
      type: Number,
      required: true,
      min: 0,
    },

    width: {
      type: Number,
      default: null,
    },

    height: {
      type: Number,
      default: null,
    },

    duration: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

MediaAssetSchema.index(
  {
    uploader: 1,
    contentHash: 1,
  },
  {
    unique: true,
    name: "unique_uploader_media_hash",
  },
);

MediaAssetSchema.index({
  uploader: 1,
  createdAt: -1,
});

module.exports = mongoose.model("MediaAsset", MediaAssetSchema);
