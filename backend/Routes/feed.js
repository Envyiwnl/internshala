const express = require("express");

const User = require("../Model/User");
const Friendship = require("../Model/Friendship");
const Follow = require("../Model/Follow");
const Post = require("../Model/Post");
const PostLike = require("../Model/PostLike");
const PostSave = require("../Model/PostSave");
const PostShare = require("../Model/PostShare");

const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");

const router = express.Router();

router.use(verifyFirebaseToken);

const getCurrentUser = async (req) => {
  return User.findOne({
    firebaseUid: req.firebaseUser.uid,
  });
};

const serializeAuthor = (user) => {
  if (!user) return null;

  return {
    id: user._id.toString(),
    username: user.username || "",
    name: user.name || "",
    photo: user.photo || "",
  };
};

const serializePost = (post, interactionState = {}) => {
  return {
    id: post._id.toString(),
    author: serializeAuthor(post.author),
    text: post.text,
    privacy: post.privacy,
    hashtags: post.hashtags || [],
    friendCountAtPosting: post.friendCountAtPosting,
    editedAt: post.editedAt,
    likeCount: post.likeCount || 0,
    commentCount: post.commentCount || 0,
    shareCount: post.shareCount || 0,
    saveCount: post.saveCount || 0,
    viewCount: post.viewCount || 0,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    liked: interactionState.liked || false,
    saved: interactionState.saved || false,
    shared: interactionState.shared || false,
  };
};

const calculateFeedScore = ({
  post,
  currentUserId,
  friendIdSet,
  followingIdSet,
}) => {
  const authorId = post.author._id
    ? post.author._id.toString()
    : post.author.toString();

  const currentUserIdString = currentUserId.toString();

  let score = 0;

  if (authorId === currentUserIdString) {
    score += 40;
  } else {
    if (friendIdSet.has(authorId)) {
      score += 30;
    }

    if (followingIdSet.has(authorId)) {
      score += 20;
    }
  }

  const mentionedCurrentUser = (post.mentions || []).some(
    (userId) => userId.toString() === currentUserIdString,
  );

  if (mentionedCurrentUser) {
    score += 25;
  }

  score += Math.min(
    (post.likeCount || 0) * 2 +
      (post.commentCount || 0) * 3 +
      (post.shareCount || 0) * 4 +
      (post.saveCount || 0),
    50,
  );

  const ageHours = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);

  if (ageHours <= 6) {
    score += 50;
  } else if (ageHours <= 24) {
    score += 35;
  } else if (ageHours <= 72) {
    score += 20;
  } else if (ageHours <= 168) {
    score += 10;
  }

  return score;
};

router.get("/", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const requestedLimit = Number(req.query.limit) || 20;
    const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 50);
    const requestedOffset = Number(req.query.offset) || 0;
    const offset = Math.max(Math.floor(requestedOffset), 0);

    const [friendships, following] = await Promise.all([
      Friendship.find({
        status: "accepted",
        $or: [{ requester: currentUser._id }, { recipient: currentUser._id }],
      })
        .select("requester recipient")
        .lean(),

      Follow.find({
        follower: currentUser._id,
      })
        .select("following")
        .lean(),
    ]);

    const friendIds = friendships.map((friendship) =>
      friendship.requester.toString() === currentUser._id.toString()
        ? friendship.recipient
        : friendship.requester,
    );

    const followingIds = following.map((follow) => follow.following);

    const friendIdSet = new Set(friendIds.map((userId) => userId.toString()));

    const followingIdSet = new Set(
      followingIds.map((userId) => userId.toString()),
    );

    const visibilityConditions = [
      {
        author: currentUser._id,
      },
      {
        privacy: "public",
      },
    ];

    if (friendIds.length) {
      visibilityConditions.push({
        author: { $in: friendIds },
        privacy: "friends",
      });
    }

    if (followingIds.length) {
      visibilityConditions.push({
        author: { $in: followingIds },
        privacy: "followers",
      });
    }

    const candidateLimit = 500;

    const candidates = await Post.find({
      $or: visibilityConditions,
    })
      .populate("author", "username name photo")
      .sort({
        createdAt: -1,
      })
      .limit(candidateLimit);

    const rankedCandidates = candidates
      .map((post) => ({
        post,
        score: calculateFeedScore({
          post,
          currentUserId: currentUser._id,
          friendIdSet,
          followingIdSet,
        }),
      }))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return b.post.createdAt.getTime() - a.post.createdAt.getTime();
      });

    const rankedPosts = rankedCandidates
      .slice(offset, offset + limit)
      .map(({ post }) => post);

    const postIds = rankedPosts.map((post) => post._id);

    const [likes, saves, shares] = postIds.length
      ? await Promise.all([
          PostLike.find({
            post: { $in: postIds },
            user: currentUser._id,
          })
            .select("post")
            .lean(),

          PostSave.find({
            post: { $in: postIds },
            user: currentUser._id,
          })
            .select("post")
            .lean(),

          PostShare.find({
            post: { $in: postIds },
            user: currentUser._id,
          })
            .select("post")
            .lean(),
        ])
      : [[], [], []];

    const likedPostIds = new Set(likes.map((like) => like.post.toString()));

    const savedPostIds = new Set(saves.map((save) => save.post.toString()));

    const sharedPostIds = new Set(shares.map((share) => share.post.toString()));

    const nextOffset =
      offset + rankedPosts.length < rankedCandidates.length
        ? offset + rankedPosts.length
        : null;

    return res.status(200).json({
      posts: rankedPosts.map((post) => {
        const postId = post._id.toString();

        return serializePost(post, {
          liked: likedPostIds.has(postId),
          saved: savedPostIds.has(postId),
          shared: sharedPostIds.has(postId),
        });
      }),
      count: rankedPosts.length,
      pagination: {
        offset,
        nextOffset,
        hasMore: nextOffset !== null,
      },
    });
  } catch (error) {
    console.error("Feed fetch failed:", error);

    return res.status(500).json({
      error: "FEED_FETCH_FAILED",
    });
  }
});

module.exports = router;
