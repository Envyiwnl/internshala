const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");

const User = require("../Model/User");
const Friendship = require("../Model/Friendship");
const Follow = require("../Model/Follow");
const Post = require("../Model/Post");
const PostLike = require("../Model/PostLike");
const PostComment = require("../Model/PostComment");
const PostSave = require("../Model/PostSave");
const PostShare = require("../Model/PostShare");
const PostView = require("../Model/PostView");
const PostReport = require("../Model/PostReport");
const Notification = require("../Model/Notification");
const MediaAsset = require("../Model/MediaAsset");
const {
  POST_MUTATION_WINDOW_MINUTES,
  POST_MUTATION_WINDOW_MS,
  getPostMutationDeadline,
} = require("../config/socialConfig");

const cloudinary = require("../config/cloudinary");

const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");
const {
  postCreationLimiter,
  commentCreationLimiter,
  reportCreationLimiter,
} = require("../middleware/socialRateLimits");

const { reservePostQuota, releasePostQuota } = require("../utils/postQuota");
const { validateSocialContent } = require("../utils/ContentValidation");

const router = express.Router();

router.use(verifyFirebaseToken);

const ALLOWED_PRIVACY = new Set(["public", "friends", "followers", "private"]);
const MAX_POST_TEXT_LENGTH = 3000;
const DUPLICATE_POST_WINDOW_MS = 10 * 60 * 1000;
const ALLOWED_REPORT_REASONS = new Set([
  "spam",
  "harassment",
  "hate",
  "misinformation",
  "inappropriate",
  "other",
]);

const MAX_REPORT_DETAILS_LENGTH = 500;

const normalizePostText = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const buildContentHash = (text) => {
  const normalizedText = text.normalize("NFKC").replace(/\s+/g, " ").trim();

  return crypto
    .createHash("sha256")
    .update(normalizedText, "utf8")
    .digest("hex");
};

const extractHashtags = (text) => {
  const matches = text.matchAll(/#([\p{L}\p{N}_]+)/gu);

  return [...new Set(Array.from(matches, (match) => match[1].toLowerCase()))];
};

const extractMentionUsernames = (text) => {
  const matches = text.matchAll(/@([a-zA-Z0-9_]+)/g);

  return [...new Set(Array.from(matches, (match) => match[1].toLowerCase()))];
};

const resolveMentionUserIds = async (usernames) => {
  if (!usernames.length) {
    return [];
  }

  const users = await User.find({
    username: {
      $in: usernames,
    },
  }).select("_id");

  return users.map((user) => user._id);
};

const validatePostText = (value, { required = true } = {}) => {
  const text = normalizePostText(value);

  if (!text && required) {
    return {
      valid: false,
      error: "POST_CONTENT_REQUIRED",
    };
  }

  if (text.length > MAX_POST_TEXT_LENGTH) {
    return {
      valid: false,
      error: "POST_TEXT_TOO_LONG",
    };
  }

  const contentValidation = validateSocialContent(text);

  if (!contentValidation.valid) {
    return contentValidation;
  }

  return {
    valid: true,
    text,
  };
};

const getCurrentUser = async (req) => {
  return User.findOne({
    firebaseUid: req.firebaseUser.uid,
  });
};

const getExactFriendCount = async (userId) => {
  return Friendship.countDocuments({
    status: "accepted",
    $or: [{ requester: userId }, { recipient: userId }],
  });
};

const serializeAuthor = (user) => {
  return {
    id: user._id.toString(),
    username: user.username || "",
    name: user.name || "",
    photo: user.photo || "",
  };
};

const serializeMedia = (media) => {
  if (!media || !media.secureUrl) {
    return null;
  }

  return {
    id: media._id.toString(),
    resourceType: media.resourceType,
    mimeType: media.mimeType,
    url: media.secureUrl,
    format: media.format || "",
    bytes: media.bytes || 0,
    width: media.width ?? null,
    height: media.height ?? null,
    duration: media.duration ?? null,
  };
};

const serializePost = (post, author, media = post.media) => {
  return {
    id: post._id.toString(),
    author: serializeAuthor(author),
    text: post.text,
    privacy: post.privacy,
    media: serializeMedia(media),
    friendCountAtPosting: post.friendCountAtPosting,
    editedAt: post.editedAt,
    mutationWindowMinutes: POST_MUTATION_WINDOW_MINUTES,
    editableUntil: getPostMutationDeadline(post.createdAt),
    likeCount: post.likeCount || 0,
    commentCount: post.commentCount || 0,
    shareCount: post.shareCount || 0,
    saveCount: post.saveCount || 0,
    viewCount: post.viewCount || 0,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
};

const serializeComment = (comment, author) => {
  return {
    id: comment._id.toString(),
    author: serializeAuthor(author),
    text: comment.text,
    editedAt: comment.editedAt,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
};

const canViewPost = async ({ post, currentUserId }) => {
  const authorId = post.author._id || post.author;

  if (authorId.toString() === currentUserId.toString()) {
    return true;
  }

  if (post.privacy === "public") {
    return true;
  }

  if (post.privacy === "private") {
    return false;
  }

  if (post.privacy === "friends") {
    const friendship = await Friendship.exists({
      status: "accepted",

      $or: [
        {
          requester: currentUserId,
          recipient: authorId,
        },
        {
          requester: authorId,
          recipient: currentUserId,
        },
      ],
    });

    return Boolean(friendship);
  }

  if (post.privacy === "followers") {
    const follow = await Follow.exists({
      follower: currentUserId,
      following: authorId,
    });

    return Boolean(follow);
  }

  return false;
};

router.post("/", postCreationLimiter, async (req, res) => {
  let reservedQuota = null;
  let quotaUserId = null;
  let postCreated = false;
  let createdPost = null;

  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const mediaId =
      typeof req.body?.mediaId === "string" ? req.body.mediaId.trim() : "";

    let mediaAsset = null;

    if (mediaId) {
      if (!mongoose.Types.ObjectId.isValid(mediaId)) {
        return res.status(400).json({
          error: "INVALID_MEDIA_ID",
        });
      }

      mediaAsset = await MediaAsset.findOne({
        _id: mediaId,
        uploader: currentUser._id,
        post: null,
      });

      if (!mediaAsset) {
        return res.status(404).json({
          error: "MEDIA_NOT_AVAILABLE",
        });
      }
    }

    const textValidation = validatePostText(req.body?.text, {
      required: !mediaAsset,
    });

    if (!textValidation.valid) {
      return res.status(400).json({
        error: textValidation.error,
        maxLength: MAX_POST_TEXT_LENGTH,
      });
    }

    const text = textValidation.text;
    const contentHash = text ? buildContentHash(text) : null;
    const hashtags = text ? extractHashtags(text) : [];
    const mentionUsernames = text ? extractMentionUsernames(text) : [];
    const mentionUserIds = await resolveMentionUserIds(mentionUsernames);

    const privacy =
      typeof req.body?.privacy === "string"
        ? req.body.privacy.trim().toLowerCase()
        : "public";

    if (!ALLOWED_PRIVACY.has(privacy)) {
      return res.status(400).json({
        error: "INVALID_POST_PRIVACY",
      });
    }

    const friendCount = await getExactFriendCount(currentUser._id);

    quotaUserId = currentUser._id;

    const duplicateWindowStart = new Date(
      Date.now() - DUPLICATE_POST_WINDOW_MS,
    );
    if (contentHash) {
      const duplicatePost = await Post.exists({
        author: currentUser._id,
        contentHash,
        createdAt: {
          $gte: duplicateWindowStart,
        },
      });

      if (duplicatePost) {
        return res.status(409).json({
          error: "DUPLICATE_POST",
        });
      }
    }

    reservedQuota = await reservePostQuota({
      userId: currentUser._id,
      friendCount,
    });

    if (!reservedQuota.allowed) {
      if (reservedQuota.limit === 0) {
        return res.status(403).json({
          error: "POSTING_REQUIRES_FRIEND",
          friendCount,
          dailyLimit: 0,
          postsUsed: 0,
        });
      }

      return res.status(429).json({
        error: "DAILY_POST_LIMIT_REACHED",
        friendCount,
        dailyLimit: reservedQuota.limit,
        postsUsed: reservedQuota.postsUsed,
        dateKey: reservedQuota.dateKey,
      });
    }

    const post = await Post.create({
      author: currentUser._id,
      text,
      privacy,
      friendCountAtPosting: friendCount,
      contentHash,
      hashtags,
      mentions: mentionUserIds,
      media: mediaAsset ? mediaAsset._id : null,
    });

    createdPost = post;

    if (mediaAsset) {
      const attachedMedia = await MediaAsset.findOneAndUpdate(
        {
          _id: mediaAsset._id,
          uploader: currentUser._id,
          post: null,
        },
        {
          $set: {
            post: post._id,
          },
        },
        {
          new: true,
        },
      );

      if (!attachedMedia) {
        throw new Error("MEDIA_ATTACH_FAILED");
      }
    }

    postCreated = true;

    try {
      const notificationRecipients = [];

      for (const mentionedUserId of mentionUserIds) {
        if (mentionedUserId.toString() === currentUser._id.toString()) {
          continue;
        }

        const allowed = await canViewPost({
          post,
          currentUserId: mentionedUserId,
        });

        if (allowed) {
          notificationRecipients.push(mentionedUserId);
        }
      }

      if (notificationRecipients.length) {
        await Notification.insertMany(
          notificationRecipients.map((recipient) => ({
            recipient,
            actor: currentUser._id,
            type: "mention",
            post: post._id,
          })),
        );
      }
    } catch (notificationError) {
      console.error("Mention notification creation failed:", notificationError);
    }

    const remaining =
      reservedQuota.limit === null
        ? null
        : Math.max(reservedQuota.limit - reservedQuota.postsUsed, 0);

    return res.status(201).json({
      message: "POST_CREATED",

      post: serializePost(post, currentUser, mediaAsset),

      quota: {
        friendCount,
        dailyLimit: reservedQuota.limit,
        postsUsed: reservedQuota.postsUsed,
        remaining,
        dateKey: reservedQuota.dateKey,
      },
    });
  } catch (error) {
    if (createdPost && !postCreated) {
      try {
        await Post.deleteOne({
          _id: createdPost._id,
          author: quotaUserId,
        });
      } catch (postRollbackError) {
        console.error("Post creation rollback failed:", postRollbackError);
      }
    }
    if (reservedQuota?.allowed && quotaUserId && !postCreated) {
      try {
        await releasePostQuota({
          userId: quotaUserId,
          dateKey: reservedQuota.dateKey,
        });
      } catch (releaseError) {
        console.error("Post quota rollback failed:", releaseError);
      }
    }

    console.error("Post creation failed:", error);

    return res.status(500).json({
      error: "POST_CREATE_FAILED",
    });
  }
});

router.get("/user/:username", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const username = String(req.params.username || "")
      .trim()
      .toLowerCase();

    if (!username) {
      return res.status(400).json({
        error: "USERNAME_REQUIRED",
      });
    }

    const targetUser = await User.findOne({
      username,
    });

    if (!targetUser) {
      return res.status(404).json({
        error: "SOCIAL_USER_NOT_FOUND",
      });
    }

    const requestedLimit = Number(req.query.limit) || 20;
    const limit = Math.min(Math.max(requestedLimit, 1), 30);

    const isCurrentUser =
      targetUser._id.toString() === currentUser._id.toString();

    let allowedPrivacies = ["public"];

    if (isCurrentUser) {
      allowedPrivacies = ["public", "friends", "followers", "private"];
    } else {
      const [friendship, following] = await Promise.all([
        Friendship.exists({
          status: "accepted",

          $or: [
            {
              requester: currentUser._id,
              recipient: targetUser._id,
            },
            {
              requester: targetUser._id,
              recipient: currentUser._id,
            },
          ],
        }),

        Follow.exists({
          follower: currentUser._id,
          following: targetUser._id,
        }),
      ]);

      if (friendship) {
        allowedPrivacies.push("friends");
      }

      if (following) {
        allowedPrivacies.push("followers");
      }
    }

    const posts = await Post.find({
      author: targetUser._id,

      privacy: {
        $in: allowedPrivacies,
      },
    })
      .populate("author", "username name photo")
      .populate(
        "media",
        "resourceType mimeType secureUrl format bytes width height duration",
      )
      .sort({
        createdAt: -1,
      })
      .limit(limit);

    return res.status(200).json({
      user: serializeAuthor(targetUser),

      posts: posts.map((post) => serializePost(post, post.author)),

      count: posts.length,
    });
  } catch (error) {
    console.error("User posts fetch failed:", error);

    return res.status(500).json({
      error: "USER_POSTS_FETCH_FAILED",
    });
  }
});

router.put("/:postId", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        error: "INVALID_POST_ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        error: "POST_NOT_FOUND",
      });
    }

    if (post.author.toString() !== currentUser._id.toString()) {
      return res.status(403).json({
        error: "POST_EDIT_FORBIDDEN",
      });
    }

    const now = new Date();

    if (now.getTime() - post.createdAt.getTime() > POST_MUTATION_WINDOW_MS) {
      return res.status(403).json({
        error: "POST_EDIT_WINDOW_EXPIRED",
      });
    }

    const body = req.body || {};

    const hasText = Object.prototype.hasOwnProperty.call(body, "text");

    const hasPrivacy = Object.prototype.hasOwnProperty.call(body, "privacy");

    if (!hasText && !hasPrivacy) {
      return res.status(400).json({
        error: "NO_POST_CHANGES_PROVIDED",
      });
    }

    if (hasText) {
      const textValidation = validatePostText(body.text, {
        required: !post.media,
      });

      if (!textValidation.valid) {
        return res.status(400).json({
          error: textValidation.error,
          maxLength: MAX_POST_TEXT_LENGTH,
        });
      }

      const text = textValidation.text;
      const contentHash = text ? buildContentHash(text) : null;
      const hashtags = text ? extractHashtags(text) : [];
      const mentionUsernames = text ? extractMentionUsernames(text) : [];
      const mentionUserIds = await resolveMentionUserIds(mentionUsernames);

      const duplicateWindowStart = new Date(
        Date.now() - DUPLICATE_POST_WINDOW_MS,
      );

      if (contentHash) {
        const duplicatePost = await Post.exists({
          _id: {
            $ne: post._id,
          },
          author: currentUser._id,
          contentHash,
          createdAt: {
            $gte: duplicateWindowStart,
          },
        });

        if (duplicatePost) {
          return res.status(409).json({
            error: "DUPLICATE_POST",
          });
        }
      }

      post.text = text;
      post.contentHash = contentHash;
      post.hashtags = hashtags;
      post.mentions = mentionUserIds;
    }

    if (hasPrivacy) {
      const privacy =
        typeof body.privacy === "string"
          ? body.privacy.trim().toLowerCase()
          : "";

      if (!ALLOWED_PRIVACY.has(privacy)) {
        return res.status(400).json({
          error: "INVALID_POST_PRIVACY",
        });
      }

      post.privacy = privacy;
    }

    post.editedAt = now;

    await post.save();

    await post.populate(
      "media",
      "resourceType mimeType secureUrl format bytes width height duration",
    );

    try {
      const desiredRecipients = [];

      for (const mentionedUserId of post.mentions || []) {
        if (mentionedUserId.toString() === currentUser._id.toString()) {
          continue;
        }

        const allowed = await canViewPost({
          post,
          currentUserId: mentionedUserId,
        });

        if (allowed) {
          desiredRecipients.push(mentionedUserId);
        }
      }

      const existingNotifications = await Notification.find({
        post: post._id,
        actor: currentUser._id,
        type: "mention",
      }).select("_id recipient");

      const desiredRecipientSet = new Set(
        desiredRecipients.map((userId) => userId.toString()),
      );

      const existingRecipientSet = new Set(
        existingNotifications.map((notification) =>
          notification.recipient.toString(),
        ),
      );

      const staleNotificationIds = existingNotifications
        .filter(
          (notification) =>
            !desiredRecipientSet.has(notification.recipient.toString()),
        )
        .map((notification) => notification._id);

      if (staleNotificationIds.length) {
        await Notification.deleteMany({
          _id: {
            $in: staleNotificationIds,
          },
        });
      }

      const missingRecipients = desiredRecipients.filter(
        (userId) => !existingRecipientSet.has(userId.toString()),
      );

      if (missingRecipients.length) {
        await Notification.insertMany(
          missingRecipients.map((recipient) => ({
            recipient,
            actor: currentUser._id,
            type: "mention",
            post: post._id,
          })),
        );
      }
    } catch (notificationError) {
      console.error(
        "Edited post mention notification sync failed:",
        notificationError,
      );
    }

    return res.status(200).json({
      message: "POST_UPDATED",

      post: serializePost(post, currentUser),
    });
  } catch (error) {
    console.error("Post update failed:", error);

    return res.status(500).json({
      error: "POST_UPDATE_FAILED",
    });
  }
});

router.delete("/:postId", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        error: "INVALID_POST_ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        error: "POST_NOT_FOUND",
      });
    }

    if (post.author.toString() !== currentUser._id.toString()) {
      return res.status(403).json({
        error: "POST_DELETE_FORBIDDEN",
      });
    }

    const now = new Date();

    if (now.getTime() - post.createdAt.getTime() > POST_MUTATION_WINDOW_MS) {
      return res.status(403).json({
        error: "POST_DELETE_WINDOW_EXPIRED",
      });
    }

    const deletedPost = await Post.findOneAndDelete({
      _id: post._id,
      author: currentUser._id,
    });

    if (!deletedPost) {
      return res.status(404).json({
        error: "POST_NOT_FOUND",
      });
    }

    if (deletedPost.media) {
      try {
        const mediaAsset = await MediaAsset.findOne({
          _id: deletedPost.media,
          uploader: currentUser._id,
          post: deletedPost._id,
        });

        if (mediaAsset) {
          await cloudinary.uploader.destroy(mediaAsset.cloudinaryPublicId, {
            resource_type: mediaAsset.resourceType,
          });

          await MediaAsset.deleteOne({
            _id: mediaAsset._id,
          });
        }
      } catch (mediaCleanupError) {
        console.error("Post media cleanup failed:", mediaCleanupError);
      }
    }

    try {
      await Promise.all([
        PostLike.deleteMany({ post: post._id }),
        PostComment.deleteMany({ post: post._id }),
        PostSave.deleteMany({ post: post._id }),
        PostShare.deleteMany({ post: post._id }),
        PostView.deleteMany({ post: post._id }),
        PostReport.deleteMany({ post: post._id }),
        Notification.deleteMany({ post: post._id }),
      ]);
    } catch (cleanupError) {
      console.error("Post interaction cleanup failed:", cleanupError);
    }

    return res.status(200).json({
      message: "POST_DELETED",
      postId: post._id.toString(),
    });
  } catch (error) {
    console.error("Post deletion failed:", error);

    return res.status(500).json({
      error: "POST_DELETE_FAILED",
    });
  }
});

router.post("/:postId/likes", async (req, res) => {
  let createdLike = null;

  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        error: "INVALID_POST_ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        error: "POST_NOT_FOUND",
      });
    }

    const allowed = await canViewPost({
      post,
      currentUserId: currentUser._id,
    });

    if (!allowed) {
      return res.status(403).json({
        error: "POST_ACCESS_DENIED",
      });
    }

    try {
      createdLike = await PostLike.create({
        post: post._id,
        user: currentUser._id,
      });
    } catch (error) {
      if (error?.code === 11000) {
        const latestPost = await Post.findById(post._id).select("likeCount");

        return res.status(200).json({
          message: "POST_ALREADY_LIKED",
          liked: true,
          likeCount: latestPost?.likeCount || 0,
        });
      }

      throw error;
    }

    try {
      const updatedPost = await Post.findByIdAndUpdate(
        post._id,
        {
          $inc: {
            likeCount: 1,
          },
        },
        {
          new: true,
        },
      ).select("likeCount");

      if (!updatedPost) {
        throw new Error("POST_NOT_FOUND_AFTER_LIKE");
      }

      if (post.author.toString() !== currentUser._id.toString()) {
        try {
          await Notification.create({
            recipient: post.author,
            actor: currentUser._id,
            type: "like",
            post: post._id,
          });
        } catch (notificationError) {
          console.error(
            "Like notification creation failed:",
            notificationError,
          );
        }
      }

      return res.status(201).json({
        message: "POST_LIKED",
        liked: true,
        likeCount: updatedPost.likeCount,
      });
    } catch (error) {
      try {
        await PostLike.deleteOne({
          _id: createdLike._id,
        });
      } catch (rollbackError) {
        console.error("Post like rollback failed:", rollbackError);
      }

      throw error;
    }
  } catch (error) {
    console.error("Post like failed:", error);

    return res.status(500).json({
      error: "POST_LIKE_FAILED",
    });
  }
});

router.delete("/:postId/likes", async (req, res) => {
  let deletedLike = null;

  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        error: "INVALID_POST_ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        error: "POST_NOT_FOUND",
      });
    }

    const allowed = await canViewPost({
      post,
      currentUserId: currentUser._id,
    });

    if (!allowed) {
      return res.status(403).json({
        error: "POST_ACCESS_DENIED",
      });
    }

    deletedLike = await PostLike.findOneAndDelete({
      post: post._id,
      user: currentUser._id,
    });

    if (!deletedLike) {
      return res.status(200).json({
        message: "POST_NOT_LIKED",
        liked: false,
        likeCount: post.likeCount || 0,
      });
    }

    const updatedPost = await Post.findOneAndUpdate(
      {
        _id: post._id,

        likeCount: {
          $gt: 0,
        },
      },
      {
        $inc: {
          likeCount: -1,
        },
      },
      {
        new: true,
      },
    ).select("likeCount");

    if (!updatedPost) {
      const exactLikeCount = await PostLike.countDocuments({
        post: post._id,
      });

      const syncedPost = await Post.findByIdAndUpdate(
        post._id,
        {
          $set: {
            likeCount: exactLikeCount,
          },
        },
        {
          new: true,
        },
      ).select("likeCount");

      return res.status(200).json({
        message: "POST_UNLIKED",
        liked: false,
        likeCount: syncedPost?.likeCount ?? exactLikeCount,
      });
    }

    return res.status(200).json({
      message: "POST_UNLIKED",
      liked: false,
      likeCount: updatedPost.likeCount,
    });
  } catch (error) {
    if (deletedLike) {
      try {
        await PostLike.create({
          post: deletedLike.post,
          user: deletedLike.user,
        });
      } catch (rollbackError) {
        console.error("Post unlike rollback failed:", rollbackError);
      }
    }

    console.error("Post unlike failed:", error);

    return res.status(500).json({
      error: "POST_UNLIKE_FAILED",
    });
  }
});

router.post("/:postId/comments", commentCreationLimiter, async (req, res) => {
  let createdComment = null;

  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        error: "INVALID_POST_ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        error: "POST_NOT_FOUND",
      });
    }

    const allowed = await canViewPost({
      post,
      currentUserId: currentUser._id,
    });

    if (!allowed) {
      return res.status(403).json({
        error: "POST_ACCESS_DENIED",
      });
    }

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

    if (!text) {
      return res.status(400).json({
        error: "COMMENT_TEXT_REQUIRED",
      });
    }

    const contentValidation = validateSocialContent(text);

    if (!contentValidation.valid) {
      return res.status(422).json({
        error: contentValidation.error,
      });
    }

    createdComment = await PostComment.create({
      post: post._id,
      author: currentUser._id,
      text,
    });

    try {
      const updatedPost = await Post.findByIdAndUpdate(
        post._id,
        {
          $inc: {
            commentCount: 1,
          },
        },
        {
          new: true,
        },
      ).select("commentCount");

      if (!updatedPost) {
        throw new Error("POST_NOT_FOUND_AFTER_COMMENT");
      }

      if (post.author.toString() !== currentUser._id.toString()) {
        try {
          await Notification.create({
            recipient: post.author,
            actor: currentUser._id,
            type: "comment",
            post: post._id,
            comment: createdComment._id,
          });
        } catch (notificationError) {
          console.error(
            "Comment notification creation failed:",
            notificationError,
          );
        }
      }

      return res.status(201).json({
        message: "COMMENT_CREATED",
        comment: serializeComment(createdComment, currentUser),
        commentCount: updatedPost.commentCount,
      });
    } catch (error) {
      try {
        await PostComment.deleteOne({
          _id: createdComment._id,
        });
      } catch (rollbackError) {
        console.error("Comment creation rollback failed:", rollbackError);
      }

      throw error;
    }
  } catch (error) {
    console.error("Comment creation failed:", error);

    return res.status(500).json({
      error: "COMMENT_CREATE_FAILED",
    });
  }
});

router.get("/:postId/comments", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        error: "INVALID_POST_ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        error: "POST_NOT_FOUND",
      });
    }

    const allowed = await canViewPost({
      post,
      currentUserId: currentUser._id,
    });

    if (!allowed) {
      return res.status(403).json({
        error: "POST_ACCESS_DENIED",
      });
    }

    const comments = await PostComment.find({
      post: post._id,
    })
      .populate("author", "username name photo")
      .sort({
        createdAt: 1,
      });

    return res.status(200).json({
      comments: comments.map((comment) =>
        serializeComment(comment, comment.author),
      ),
      count: comments.length,
    });
  } catch (error) {
    console.error("Comments fetch failed:", error);

    return res.status(500).json({
      error: "COMMENTS_FETCH_FAILED",
    });
  }
});

router.put("/:postId/comments/:commentId", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { postId, commentId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(postId) ||
      !mongoose.Types.ObjectId.isValid(commentId)
    ) {
      return res.status(400).json({
        error: "INVALID_ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        error: "POST_NOT_FOUND",
      });
    }

    const allowed = await canViewPost({
      post,
      currentUserId: currentUser._id,
    });

    if (!allowed) {
      return res.status(403).json({
        error: "POST_ACCESS_DENIED",
      });
    }

    const comment = await PostComment.findOne({
      _id: commentId,
      post: post._id,
    });

    if (!comment) {
      return res.status(404).json({
        error: "COMMENT_NOT_FOUND",
      });
    }

    if (comment.author.toString() !== currentUser._id.toString()) {
      return res.status(403).json({
        error: "COMMENT_EDIT_FORBIDDEN",
      });
    }

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

    if (!text) {
      return res.status(400).json({
        error: "COMMENT_TEXT_REQUIRED",
      });
    }

    const contentValidation = validateSocialContent(text);

    if (!contentValidation.valid) {
      return res.status(422).json({
        error: contentValidation.error,
      });
    }

    comment.text = text;
    comment.editedAt = new Date();

    await comment.save();

    return res.status(200).json({
      message: "COMMENT_UPDATED",
      comment: serializeComment(comment, currentUser),
    });
  } catch (error) {
    console.error("Comment update failed:", error);

    return res.status(500).json({
      error: "COMMENT_UPDATE_FAILED",
    });
  }
});

router.delete("/:postId/comments/:commentId", async (req, res) => {
  let deletedComment = null;

  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { postId, commentId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(postId) ||
      !mongoose.Types.ObjectId.isValid(commentId)
    ) {
      return res.status(400).json({
        error: "INVALID_ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        error: "POST_NOT_FOUND",
      });
    }

    const allowed = await canViewPost({
      post,
      currentUserId: currentUser._id,
    });

    if (!allowed) {
      return res.status(403).json({
        error: "POST_ACCESS_DENIED",
      });
    }

    const comment = await PostComment.findOne({
      _id: commentId,
      post: post._id,
    });

    if (!comment) {
      return res.status(404).json({
        error: "COMMENT_NOT_FOUND",
      });
    }

    if (comment.author.toString() !== currentUser._id.toString()) {
      return res.status(403).json({
        error: "COMMENT_DELETE_FORBIDDEN",
      });
    }

    deletedComment = await PostComment.findOneAndDelete({
      _id: comment._id,
      author: currentUser._id,
    });

    if (!deletedComment) {
      return res.status(404).json({
        error: "COMMENT_NOT_FOUND",
      });
    }

    const updatedPost = await Post.findOneAndUpdate(
      {
        _id: post._id,
        commentCount: {
          $gt: 0,
        },
      },
      {
        $inc: {
          commentCount: -1,
        },
      },
      {
        new: true,
      },
    ).select("commentCount");

    if (!updatedPost) {
      const exactCommentCount = await PostComment.countDocuments({
        post: post._id,
      });

      const syncedPost = await Post.findByIdAndUpdate(
        post._id,
        {
          $set: {
            commentCount: exactCommentCount,
          },
        },
        {
          new: true,
        },
      ).select("commentCount");

      try {
        await Notification.deleteMany({
          comment: deletedComment._id,
        });
      } catch (notificationError) {
        console.error(
          "Deleted comment notification cleanup failed:",
          notificationError,
        );
      }

      return res.status(200).json({
        message: "COMMENT_DELETED",
        commentId: deletedComment._id.toString(),
        commentCount: syncedPost?.commentCount ?? exactCommentCount,
      });
    }

    try {
      await Notification.deleteMany({
        comment: deletedComment._id,
      });
    } catch (notificationError) {
      console.error(
        "Deleted comment notification cleanup failed:",
        notificationError,
      );
    }

    return res.status(200).json({
      message: "COMMENT_DELETED",
      commentId: deletedComment._id.toString(),
      commentCount: updatedPost.commentCount,
    });
  } catch (error) {
    if (deletedComment) {
      try {
        await PostComment.create({
          _id: deletedComment._id,
          post: deletedComment.post,
          author: deletedComment.author,
          text: deletedComment.text,
          editedAt: deletedComment.editedAt,
          createdAt: deletedComment.createdAt,
          updatedAt: deletedComment.updatedAt,
        });
      } catch (rollbackError) {
        console.error("Comment deletion rollback failed:", rollbackError);
      }
    }

    console.error("Comment deletion failed:", error);

    return res.status(500).json({
      error: "COMMENT_DELETE_FAILED",
    });
  }
});

router.post("/:postId/saves", async (req, res) => {
  let createdSave = null;

  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        error: "INVALID_POST_ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        error: "POST_NOT_FOUND",
      });
    }

    const allowed = await canViewPost({
      post,
      currentUserId: currentUser._id,
    });

    if (!allowed) {
      return res.status(403).json({
        error: "POST_ACCESS_DENIED",
      });
    }

    try {
      createdSave = await PostSave.create({
        post: post._id,
        user: currentUser._id,
      });
    } catch (error) {
      if (error?.code === 11000) {
        const latestPost = await Post.findById(post._id).select("saveCount");

        return res.status(200).json({
          message: "POST_ALREADY_SAVED",
          saved: true,
          saveCount: latestPost?.saveCount || 0,
        });
      }

      throw error;
    }

    try {
      const updatedPost = await Post.findByIdAndUpdate(
        post._id,
        {
          $inc: {
            saveCount: 1,
          },
        },
        {
          new: true,
        },
      ).select("saveCount");

      if (!updatedPost) {
        throw new Error("POST_NOT_FOUND_AFTER_SAVE");
      }

      return res.status(201).json({
        message: "POST_SAVED",
        saved: true,
        saveCount: updatedPost.saveCount,
      });
    } catch (error) {
      try {
        await PostSave.deleteOne({
          _id: createdSave._id,
        });
      } catch (rollbackError) {
        console.error("Post save rollback failed:", rollbackError);
      }

      throw error;
    }
  } catch (error) {
    console.error("Post save failed:", error);

    return res.status(500).json({
      error: "POST_SAVE_FAILED",
    });
  }
});

router.delete("/:postId/saves", async (req, res) => {
  let deletedSave = null;

  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        error: "INVALID_POST_ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        error: "POST_NOT_FOUND",
      });
    }

    const allowed = await canViewPost({
      post,
      currentUserId: currentUser._id,
    });

    if (!allowed) {
      return res.status(403).json({
        error: "POST_ACCESS_DENIED",
      });
    }

    deletedSave = await PostSave.findOneAndDelete({
      post: post._id,
      user: currentUser._id,
    });

    if (!deletedSave) {
      return res.status(200).json({
        message: "POST_NOT_SAVED",
        saved: false,
        saveCount: post.saveCount || 0,
      });
    }

    const updatedPost = await Post.findOneAndUpdate(
      {
        _id: post._id,
        saveCount: {
          $gt: 0,
        },
      },
      {
        $inc: {
          saveCount: -1,
        },
      },
      {
        new: true,
      },
    ).select("saveCount");

    if (!updatedPost) {
      const exactSaveCount = await PostSave.countDocuments({
        post: post._id,
      });

      const syncedPost = await Post.findByIdAndUpdate(
        post._id,
        {
          $set: {
            saveCount: exactSaveCount,
          },
        },
        {
          new: true,
        },
      ).select("saveCount");

      return res.status(200).json({
        message: "POST_UNSAVED",
        saved: false,
        saveCount: syncedPost?.saveCount ?? exactSaveCount,
      });
    }

    return res.status(200).json({
      message: "POST_UNSAVED",
      saved: false,
      saveCount: updatedPost.saveCount,
    });
  } catch (error) {
    if (deletedSave) {
      try {
        await PostSave.create({
          _id: deletedSave._id,
          post: deletedSave.post,
          user: deletedSave.user,
          createdAt: deletedSave.createdAt,
          updatedAt: deletedSave.updatedAt,
        });
      } catch (rollbackError) {
        console.error("Post unsave rollback failed:", rollbackError);
      }
    }

    console.error("Post unsave failed:", error);

    return res.status(500).json({
      error: "POST_UNSAVE_FAILED",
    });
  }
});

router.get("/saved/me", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const saves = await PostSave.find({
      user: currentUser._id,
    })
      .populate({
        path: "post",
        populate: [
          {
            path: "author",
            select: "username name photo",
          },
          {
            path: "media",
            select:
              "resourceType mimeType secureUrl format bytes width height duration",
          },
        ],
      })
      .sort({
        createdAt: -1,
      });

    const visiblePosts = [];

    for (const save of saves) {
      const post = save.post;

      if (!post || !post.author) {
        continue;
      }

      const allowed = await canViewPost({
        post,
        currentUserId: currentUser._id,
      });

      if (!allowed) {
        continue;
      }

      visiblePosts.push({
        ...serializePost(post, post.author),
        savedAt: save.createdAt,
      });
    }

    return res.status(200).json({
      posts: visiblePosts,
      count: visiblePosts.length,
    });
  } catch (error) {
    console.error("Saved posts fetch failed:", error);

    return res.status(500).json({
      error: "SAVED_POSTS_FETCH_FAILED",
    });
  }
});

router.post("/:postId/shares", async (req, res) => {
  let createdShare = null;

  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        error: "INVALID_POST_ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        error: "POST_NOT_FOUND",
      });
    }

    const allowed = await canViewPost({
      post,
      currentUserId: currentUser._id,
    });

    if (!allowed) {
      return res.status(403).json({
        error: "POST_ACCESS_DENIED",
      });
    }

    try {
      createdShare = await PostShare.create({
        post: post._id,
        user: currentUser._id,
      });
    } catch (error) {
      if (error?.code === 11000) {
        const latestPost = await Post.findById(post._id).select("shareCount");

        return res.status(200).json({
          message: "POST_ALREADY_SHARED",
          shared: true,
          shareCount: latestPost?.shareCount || 0,
        });
      }

      throw error;
    }

    try {
      const updatedPost = await Post.findByIdAndUpdate(
        post._id,
        {
          $inc: {
            shareCount: 1,
          },
        },
        {
          new: true,
        },
      ).select("shareCount");

      if (!updatedPost) {
        throw new Error("POST_NOT_FOUND_AFTER_SHARE");
      }

      if (post.author.toString() !== currentUser._id.toString()) {
        try {
          await Notification.create({
            recipient: post.author,
            actor: currentUser._id,
            type: "share",
            post: post._id,
          });
        } catch (notificationError) {
          console.error(
            "Share notification creation failed:",
            notificationError,
          );
        }
      }

      return res.status(201).json({
        message: "POST_SHARED",
        shared: true,
        shareCount: updatedPost.shareCount,
      });
    } catch (error) {
      try {
        await PostShare.deleteOne({
          _id: createdShare._id,
        });
      } catch (rollbackError) {
        console.error("Post share rollback failed:", rollbackError);
      }

      throw error;
    }
  } catch (error) {
    console.error("Post share failed:", error);

    return res.status(500).json({
      error: "POST_SHARE_FAILED",
    });
  }
});

router.post("/:postId/views", async (req, res) => {
  let createdView = null;

  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        error: "INVALID_POST_ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        error: "POST_NOT_FOUND",
      });
    }

    const allowed = await canViewPost({
      post,
      currentUserId: currentUser._id,
    });

    if (!allowed) {
      return res.status(403).json({
        error: "POST_ACCESS_DENIED",
      });
    }

    if (post.author.toString() === currentUser._id.toString()) {
      return res.status(200).json({
        message: "SELF_VIEW_NOT_COUNTED",
        viewed: false,
        viewCount: post.viewCount || 0,
      });
    }

    try {
      createdView = await PostView.create({
        post: post._id,
        user: currentUser._id,
      });
    } catch (error) {
      if (error?.code === 11000) {
        const latestPost = await Post.findById(post._id).select("viewCount");

        return res.status(200).json({
          message: "POST_ALREADY_VIEWED",
          viewed: true,
          viewCount: latestPost?.viewCount || 0,
        });
      }

      throw error;
    }

    try {
      const updatedPost = await Post.findByIdAndUpdate(
        post._id,
        {
          $inc: {
            viewCount: 1,
          },
        },
        {
          new: true,
        },
      ).select("viewCount");

      if (!updatedPost) {
        throw new Error("POST_NOT_FOUND_AFTER_VIEW");
      }

      return res.status(201).json({
        message: "POST_VIEW_RECORDED",
        viewed: true,
        viewCount: updatedPost.viewCount,
      });
    } catch (error) {
      try {
        await PostView.deleteOne({
          _id: createdView._id,
        });
      } catch (rollbackError) {
        console.error("Post view rollback failed:", rollbackError);
      }

      throw error;
    }
  } catch (error) {
    console.error("Post view failed:", error);

    return res.status(500).json({
      error: "POST_VIEW_FAILED",
    });
  }
});

router.post("/:postId/reports", reportCreationLimiter, async (req, res) => {
  let createdReport = null;

  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        error: "INVALID_POST_ID",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        error: "POST_NOT_FOUND",
      });
    }

    const allowed = await canViewPost({
      post,
      currentUserId: currentUser._id,
    });

    if (!allowed) {
      return res.status(403).json({
        error: "POST_ACCESS_DENIED",
      });
    }

    if (post.author.toString() === currentUser._id.toString()) {
      return res.status(403).json({
        error: "CANNOT_REPORT_OWN_POST",
      });
    }

    const reason =
      typeof req.body?.reason === "string"
        ? req.body.reason.trim().toLowerCase()
        : "";

    if (!ALLOWED_REPORT_REASONS.has(reason)) {
      return res.status(400).json({
        error: "INVALID_REPORT_REASON",
      });
    }

    const details =
      typeof req.body?.details === "string" ? req.body.details.trim() : "";

    if (details.length > MAX_REPORT_DETAILS_LENGTH) {
      return res.status(400).json({
        error: "REPORT_DETAILS_TOO_LONG",
        maxLength: MAX_REPORT_DETAILS_LENGTH,
      });
    }

    try {
      createdReport = await PostReport.create({
        post: post._id,
        reporter: currentUser._id,
        reason,
        details,
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(200).json({
          message: "POST_ALREADY_REPORTED",
          reported: true,
        });
      }

      throw error;
    }

    try {
      const updatedPost = await Post.findByIdAndUpdate(
        post._id,
        {
          $inc: {
            reportCount: 1,
          },
        },
        {
          new: true,
        },
      ).select("_id");

      if (!updatedPost) {
        throw new Error("POST_NOT_FOUND_AFTER_REPORT");
      }

      return res.status(201).json({
        message: "POST_REPORTED",
        reported: true,
      });
    } catch (error) {
      try {
        await PostReport.deleteOne({
          _id: createdReport._id,
        });
      } catch (rollbackError) {
        console.error("Post report rollback failed:", rollbackError);
      }

      throw error;
    }
  } catch (error) {
    console.error("Post report failed:", error);

    return res.status(500).json({
      error: "POST_REPORT_FAILED",
    });
  }
});

router.get("/:postId", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        error: "INVALID_POST_ID",
      });
    }

    const post = await Post.findById(postId)
      .populate("author", "username name photo")
      .populate(
        "media",
        "resourceType mimeType secureUrl format bytes width height duration",
      );

    if (!post) {
      return res.status(404).json({
        error: "POST_NOT_FOUND",
      });
    }

    if (!post.author) {
      return res.status(404).json({
        error: "POST_AUTHOR_NOT_FOUND",
      });
    }

    const allowed = await canViewPost({
      post,
      currentUserId: currentUser._id,
    });

    if (!allowed) {
      return res.status(403).json({
        error: "POST_ACCESS_DENIED",
      });
    }

    return res.status(200).json({
      post: serializePost(post, post.author),
    });
  } catch (error) {
    console.error("Post fetch failed:", error);

    return res.status(500).json({
      error: "POST_FETCH_FAILED",
    });
  }
});

module.exports = router;
