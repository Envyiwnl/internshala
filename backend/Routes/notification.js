const express = require("express");
const mongoose = require("mongoose");

const User = require("../Model/User");
const Notification = require("../Model/Notification");

const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");

const router = express.Router();

router.use(verifyFirebaseToken);

const getCurrentUser = async (req) => {
  return User.findOne({
    firebaseUid: req.firebaseUser.uid,
  });
};

const serializeActor = (user) => {
  if (!user) {
    return null;
  }

  return {
    id: user._id.toString(),
    username: user.username || "",
    name: user.name || "",
    photo: user.photo || "",
  };
};

const serializeNotification = (notification) => {
  return {
    id: notification._id.toString(),
    type: notification.type,
    actor: serializeActor(notification.actor),
    postId: notification.post ? notification.post.toString() : null,
    commentId: notification.comment ? notification.comment.toString() : null,
    read: notification.read,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
};

router.get("/", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const requestedLimit = Number(req.query.limit) || 30;
    const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 50);

    const notifications = await Notification.find({
      recipient: currentUser._id,
    })
      .populate("actor", "username name photo")
      .sort({
        createdAt: -1,
      })
      .limit(limit);

    return res.status(200).json({
      notifications: notifications.map(serializeNotification),
    });
  } catch (error) {
    console.error("Notification list fetch failed:", error);

    return res.status(500).json({
      error: "NOTIFICATION_LIST_FETCH_FAILED",
    });
  }
});

router.get("/unread-count", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const unreadCount = await Notification.countDocuments({
      recipient: currentUser._id,
      read: false,
    });

    return res.status(200).json({
      unreadCount,
    });
  } catch (error) {
    console.error("Notification unread count fetch failed:", error);

    return res.status(500).json({
      error: "NOTIFICATION_UNREAD_COUNT_FETCH_FAILED",
    });
  }
});

router.patch("/:notificationId/read", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { notificationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({
        error: "INVALID_NOTIFICATION_ID",
      });
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        recipient: currentUser._id,
      },
      {
        $set: {
          read: true,
          readAt: new Date(),
        },
      },
      {
        new: true,
      },
    ).populate("actor", "username name photo");

    if (!notification) {
      return res.status(404).json({
        error: "NOTIFICATION_NOT_FOUND",
      });
    }

    return res.status(200).json({
      message: "NOTIFICATION_MARKED_READ",
      notification: serializeNotification(notification),
    });
  } catch (error) {
    console.error("Notification mark read failed:", error);

    return res.status(500).json({
      error: "NOTIFICATION_MARK_READ_FAILED",
    });
  }
});

router.patch("/read-all", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const now = new Date();

    const result = await Notification.updateMany(
      {
        recipient: currentUser._id,
        read: false,
      },
      {
        $set: {
          read: true,
          readAt: now,
        },
      },
    );

    return res.status(200).json({
      message: "ALL_NOTIFICATIONS_MARKED_READ",
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Mark all notifications read failed:", error);

    return res.status(500).json({
      error: "NOTIFICATION_MARK_ALL_READ_FAILED",
    });
  }
});

module.exports = router;
