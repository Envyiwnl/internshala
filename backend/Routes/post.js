const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");

const User = require("../Model/User");
const Friendship = require("../Model/Friendship");
const Follow = require("../Model/Follow");
const Post = require("../Model/Post");

const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");

const { reservePostQuota, releasePostQuota } = require("../utils/postQuota");

const router = express.Router();

router.use(verifyFirebaseToken);

const ALLOWED_PRIVACY = new Set(["public", "friends", "followers", "private"]);
const POST_MUTATION_WINDOW_MS = 30 * 60 * 1000;
const MAX_POST_TEXT_LENGTH = 3000;
const DUPLICATE_POST_WINDOW_MS = 10 * 60 * 1000;

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

const validatePostText = (value) => {
  const text = normalizePostText(value);

  if (!text) {
    return {
      valid: false,
      error: "POST_TEXT_REQUIRED",
    };
  }

  if (text.length > MAX_POST_TEXT_LENGTH) {
    return {
      valid: false,
      error: "POST_TEXT_TOO_LONG",
    };
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

const serializePost = (post, author) => {
  return {
    id: post._id.toString(),
    author: serializeAuthor(author),
    text: post.text,
    privacy: post.privacy,
    friendCountAtPosting: post.friendCountAtPosting,
    editedAt: post.editedAt,
    likeCount: post.likeCount || 0,
    commentCount: post.commentCount || 0,
    shareCount: post.shareCount || 0,
    saveCount: post.saveCount || 0,
    viewCount: post.viewCount || 0,
    reportCount: post.reportCount || 0,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
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

router.post("/", async (req, res) => {
  let reservedQuota = null;
  let quotaUserId = null;
  let postCreated = false;

  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const textValidation = validatePostText(req.body?.text);

    if (!textValidation.valid) {
      return res.status(400).json({
        error: textValidation.error,
        maxLength: MAX_POST_TEXT_LENGTH,
      });
    }

    const text = textValidation.text;
    const contentHash = buildContentHash(text);

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
    });

    postCreated = true;

    const remaining =
      reservedQuota.limit === null
        ? null
        : Math.max(reservedQuota.limit - reservedQuota.postsUsed, 0);

    return res.status(201).json({
      message: "POST_CREATED",

      post: serializePost(post, currentUser),

      quota: {
        friendCount,
        dailyLimit: reservedQuota.limit,
        postsUsed: reservedQuota.postsUsed,
        remaining,
        dateKey: reservedQuota.dateKey,
      },
    });
  } catch (error) {
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
      const textValidation = validatePostText(body.text);

      if (!textValidation.valid) {
        return res.status(400).json({
          error: textValidation.error,
          maxLength: MAX_POST_TEXT_LENGTH,
        });
      }

      const text = textValidation.text;
      const contentHash = buildContentHash(text);

      const duplicateWindowStart = new Date(
        Date.now() - DUPLICATE_POST_WINDOW_MS,
      );

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

      post.text = text;
      post.contentHash = contentHash;
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

    await Post.deleteOne({
      _id: post._id,
      author: currentUser._id,
    });

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

    const post = await Post.findById(postId).populate(
      "author",
      "username name photo",
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
