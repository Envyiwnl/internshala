const mongoose = require("mongoose");

const FriendshipSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    pairKey: {
      type: String,
      required: true,
      unique: true,
    },

    status: {
      type: String,
      enum: ["pending", "accepted"],
      default: "pending",
      index: true,
    },

    requestedAt: {
      type: Date,
      default: Date.now,
    },

    acceptedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

FriendshipSchema.index({
  requester: 1,
  status: 1,
  createdAt: -1,
});

FriendshipSchema.index({
  recipient: 1,
  status: 1,
  createdAt: -1,
});

module.exports = mongoose.model("Friendship", FriendshipSchema);
