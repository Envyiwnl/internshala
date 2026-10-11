const mongoose = require("mongoose");

const PostReportSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },

    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reason: {
      type: String,
      enum: [
        "spam",
        "harassment",
        "hate",
        "misinformation",
        "inappropriate",
        "other",
      ],
      required: true,
    },

    details: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

PostReportSchema.index(
  {
    post: 1,
    reporter: 1,
  },
  {
    unique: true,
    name: "unique_post_report",
  },
);

PostReportSchema.index({
  post: 1,
  createdAt: -1,
});

module.exports = mongoose.model("PostReport", PostReportSchema);
