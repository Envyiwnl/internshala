const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: [
        "mention",
        "like",
        "comment",
        "share",
        "follow",
        "friend_request",
        "friend_accept",
      ],
      required: true,
    },

    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null,
    },

    comment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostComment",
      default: null,
    },

    read: {
      type: Boolean,
      default: false,
    },

    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

NotificationSchema.index({
  recipient: 1,
  createdAt: -1,
});

NotificationSchema.index({
  recipient: 1,
  read: 1,
  createdAt: -1,
});

module.exports = mongoose.model("Notification", NotificationSchema);
