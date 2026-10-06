const express = require("express");
const mongoose = require("mongoose");

const User = require("../Model/User");
const Friendship = require("../Model/Friendship");
const Follow = require("../Model/Follow");

const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");

const { ensureUserUsername } = require("../utils/username");

const router = express.Router();

router.use(verifyFirebaseToken);

const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const buildPairKey = (firstUserId, secondUserId) => {
  return [firstUserId.toString(), secondUserId.toString()].sort().join(":");
};

const serializeUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    id: user._id.toString(),
    username: user.username || "",
    name: user.name || "",
    photo: user.photo || "",
    friendCount: user.friendCount || 0,
    followerCount: user.followerCount || 0,
    followingCount: user.followingCount || 0,
  };
};

const getCurrentUser = async (req) => {
  let user = await User.findOne({
    firebaseUid: req.firebaseUser.uid,
  });

  if (!user) {
    return null;
  }

  if (!user.username) {
    user = await ensureUserUsername(user);
  }

  return user;
};

const syncFriendCount = async (userId) => {
  const friendCount = await Friendship.countDocuments({
    status: "accepted",

    $or: [
      {
        requester: userId,
      },
      {
        recipient: userId,
      },
    ],
  });

  await User.updateOne(
    {
      _id: userId,
    },
    {
      $set: {
        friendCount,
      },
    },
  );

  return friendCount;
};

const syncFollowCounts = async (userId) => {
  const [followerCount, followingCount] = await Promise.all([
    Follow.countDocuments({
      following: userId,
    }),

    Follow.countDocuments({
      follower: userId,
    }),
  ]);

  await User.updateOne(
    {
      _id: userId,
    },
    {
      $set: {
        followerCount,
        followingCount,
      },
    },
  );

  return {
    followerCount,
    followingCount,
  };
};

const getFriendshipState = (friendship, currentUserId) => {
  if (!friendship) {
    return null;
  }

  if (friendship.status === "accepted") {
    return "friends";
  }

  if (friendship.requester.toString() === currentUserId.toString()) {
    return "request_sent";
  }

  return "request_received";
};

router.get("/me", async (req, res) => {
  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    return res.status(200).json({
      user: serializeUser(user),
    });
  } catch (error) {
    console.error("Social profile fetch failed:", error);

    return res.status(500).json({
      error: "SOCIAL_PROFILE_FETCH_FAILED",
    });
  }
});

router.get("/users", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim().slice(0, 50)
        : "";

    const requestedLimit = Number(req.query.limit) || 20;

    const limit = Math.min(Math.max(requestedLimit, 1), 30);

    const filter = {
      _id: {
        $ne: currentUser._id,
      },

      username: {
        $type: "string",
      },
    };

    if (search) {
      const expression = escapeRegex(search);

      filter.$or = [
        {
          username: {
            $regex: expression,
            $options: "i",
          },
        },
        {
          name: {
            $regex: expression,
            $options: "i",
          },
        },
      ];
    }

    const users = await User.find(filter)
      .select("username name photo friendCount followerCount followingCount")
      .sort({
        followerCount: -1,
        username: 1,
      })
      .limit(limit)
      .lean();

    const userIds = users.map((user) => user._id);

    if (!userIds.length) {
      return res.status(200).json({
        users: [],
      });
    }

    const [friendships, following, followedBy] = await Promise.all([
      Friendship.find({
        status: {
          $in: ["pending", "accepted"],
        },

        $or: [
          {
            requester: currentUser._id,

            recipient: {
              $in: userIds,
            },
          },
          {
            recipient: currentUser._id,

            requester: {
              $in: userIds,
            },
          },
        ],
      }).lean(),

      Follow.find({
        follower: currentUser._id,

        following: {
          $in: userIds,
        },
      }).lean(),

      Follow.find({
        follower: {
          $in: userIds,
        },

        following: currentUser._id,
      }).lean(),
    ]);

    const friendshipMap = new Map();

    friendships.forEach((friendship) => {
      const otherUserId =
        friendship.requester.toString() === currentUser._id.toString()
          ? friendship.recipient.toString()
          : friendship.requester.toString();

      friendshipMap.set(
        otherUserId,
        getFriendshipState(friendship, currentUser._id),
      );
    });

    const followingSet = new Set(
      following.map((entry) => entry.following.toString()),
    );

    const followedBySet = new Set(
      followedBy.map((entry) => entry.follower.toString()),
    );

    const result = users.map((user) => ({
      ...serializeUser(user),

      friendshipStatus: friendshipMap.get(user._id.toString()) || null,

      following: followingSet.has(user._id.toString()),

      followedBy: followedBySet.has(user._id.toString()),
    }));

    return res.status(200).json({
      users: result,
    });
  } catch (error) {
    console.error("Social user search failed:", error);

    return res.status(500).json({
      error: "SOCIAL_USER_SEARCH_FAILED",
    });
  }
});

router.get("/users/:username", async (req, res) => {
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

    const targetUser = await User.findOne({
      username,
    });

    if (!targetUser) {
      return res.status(404).json({
        error: "SOCIAL_USER_NOT_FOUND",
      });
    }

    if (targetUser._id.toString() === currentUser._id.toString()) {
      return res.status(200).json({
        user: serializeUser(targetUser),

        friendshipStatus: null,

        following: false,

        followedBy: false,

        isCurrentUser: true,
      });
    }

    const pairKey = buildPairKey(currentUser._id, targetUser._id);

    const [friendship, following, followedBy] = await Promise.all([
      Friendship.findOne({
        pairKey,
      }),

      Follow.exists({
        follower: currentUser._id,
        following: targetUser._id,
      }),

      Follow.exists({
        follower: targetUser._id,
        following: currentUser._id,
      }),
    ]);

    return res.status(200).json({
      user: serializeUser(targetUser),

      friendshipStatus: getFriendshipState(friendship, currentUser._id),

      following: Boolean(following),

      followedBy: Boolean(followedBy),

      isCurrentUser: false,
    });
  } catch (error) {
    console.error("Social user fetch failed:", error);

    return res.status(500).json({
      error: "SOCIAL_USER_FETCH_FAILED",
    });
  }
});

router.post("/friend-requests/:userId", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        error: "INVALID_USER_ID",
      });
    }

    if (currentUser._id.toString() === userId) {
      return res.status(400).json({
        error: "CANNOT_FRIEND_YOURSELF",
      });
    }

    const targetUser = await User.findById(userId);

    if (!targetUser) {
      return res.status(404).json({
        error: "SOCIAL_USER_NOT_FOUND",
      });
    }

    const pairKey = buildPairKey(currentUser._id, targetUser._id);

    try {
      const friendship = await Friendship.create({
        requester: currentUser._id,

        recipient: targetUser._id,

        pairKey,

        status: "pending",

        requestedAt: new Date(),
      });

      return res.status(201).json({
        message: "FRIEND_REQUEST_SENT",

        request: {
          id: friendship._id,
          status: friendship.status,
          requestedAt: friendship.requestedAt,
          recipient: serializeUser(targetUser),
        },
      });
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }

      const existing = await Friendship.findOne({
        pairKey,
      });

      if (!existing) {
        throw error;
      }

      if (existing.status === "accepted") {
        return res.status(409).json({
          error: "ALREADY_FRIENDS",
        });
      }

      if (existing.requester.toString() === currentUser._id.toString()) {
        return res.status(409).json({
          error: "FRIEND_REQUEST_ALREADY_SENT",
        });
      }

      return res.status(409).json({
        error: "FRIEND_REQUEST_ALREADY_RECEIVED",
      });
    }
  } catch (error) {
    console.error("Friend request failed:", error);

    return res.status(500).json({
      error: "FRIEND_REQUEST_FAILED",
    });
  }
});

router.get("/friend-requests", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const direction = req.query.direction || "incoming";

    let filter = {
      status: "pending",
    };

    if (direction === "incoming") {
      filter.recipient = currentUser._id;
    } else if (direction === "outgoing") {
      filter.requester = currentUser._id;
    } else if (direction === "all") {
      filter.$or = [
        {
          requester: currentUser._id,
        },
        {
          recipient: currentUser._id,
        },
      ];
    } else {
      return res.status(400).json({
        error: "INVALID_REQUEST_DIRECTION",
      });
    }

    const requests = await Friendship.find(filter)
      .populate(
        "requester",
        "username name photo friendCount followerCount followingCount",
      )
      .populate(
        "recipient",
        "username name photo friendCount followerCount followingCount",
      )
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      requests: requests.map((request) => ({
        id: request._id,
        status: request.status,
        requestedAt: request.requestedAt,

        requester: serializeUser(request.requester),

        recipient: serializeUser(request.recipient),
      })),
    });
  } catch (error) {
    console.error("Friend request list failed:", error);

    return res.status(500).json({
      error: "FRIEND_REQUEST_LIST_FAILED",
    });
  }
});

router.post("/friend-requests/:requestId/accept", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { requestId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        error: "INVALID_FRIEND_REQUEST_ID",
      });
    }

    const now = new Date();

    const friendship = await Friendship.findOneAndUpdate(
      {
        _id: requestId,

        recipient: currentUser._id,

        status: "pending",
      },
      {
        $set: {
          status: "accepted",
          acceptedAt: now,
        },
      },
      {
        new: true,
      },
    );

    if (!friendship) {
      return res.status(404).json({
        error: "FRIEND_REQUEST_NOT_FOUND",
      });
    }

    const [currentFriendCount, requesterFriendCount] = await Promise.all([
      syncFriendCount(currentUser._id),

      syncFriendCount(friendship.requester),
    ]);

    return res.status(200).json({
      message: "FRIEND_REQUEST_ACCEPTED",

      friendship: {
        id: friendship._id,
        status: friendship.status,
        acceptedAt: friendship.acceptedAt,
      },

      friendCount: currentFriendCount,

      requesterFriendCount,
    });
  } catch (error) {
    console.error("Friend request acceptance failed:", error);

    return res.status(500).json({
      error: "FRIEND_REQUEST_ACCEPT_FAILED",
    });
  }
});

router.delete("/friend-requests/:requestId/reject", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { requestId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        error: "INVALID_FRIEND_REQUEST_ID",
      });
    }

    const result = await Friendship.deleteOne({
      _id: requestId,

      recipient: currentUser._id,

      status: "pending",
    });

    if (!result.deletedCount) {
      return res.status(404).json({
        error: "FRIEND_REQUEST_NOT_FOUND",
      });
    }

    return res.status(200).json({
      message: "FRIEND_REQUEST_REJECTED",
    });
  } catch (error) {
    console.error("Friend request rejection failed:", error);

    return res.status(500).json({
      error: "FRIEND_REQUEST_REJECT_FAILED",
    });
  }
});

router.delete("/friend-requests/:requestId/cancel", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { requestId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        error: "INVALID_FRIEND_REQUEST_ID",
      });
    }

    const result = await Friendship.deleteOne({
      _id: requestId,

      requester: currentUser._id,

      status: "pending",
    });

    if (!result.deletedCount) {
      return res.status(404).json({
        error: "FRIEND_REQUEST_NOT_FOUND",
      });
    }

    return res.status(200).json({
      message: "FRIEND_REQUEST_CANCELLED",
    });
  } catch (error) {
    console.error("Friend request cancellation failed:", error);

    return res.status(500).json({
      error: "FRIEND_REQUEST_CANCEL_FAILED",
    });
  }
});

router.get("/friends", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const friendships = await Friendship.find({
      status: "accepted",

      $or: [
        {
          requester: currentUser._id,
        },
        {
          recipient: currentUser._id,
        },
      ],
    })
      .sort({
        acceptedAt: -1,
      })
      .lean();

    const friendIds = friendships.map((friendship) =>
      friendship.requester.toString() === currentUser._id.toString()
        ? friendship.recipient
        : friendship.requester,
    );

    const users = await User.find({
      _id: {
        $in: friendIds,
      },
    })
      .select("username name photo friendCount followerCount followingCount")
      .lean();

    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    const friends = friendships
      .map((friendship) => {
        const friendId =
          friendship.requester.toString() === currentUser._id.toString()
            ? friendship.recipient.toString()
            : friendship.requester.toString();

        const friend = userMap.get(friendId);

        if (!friend) {
          return null;
        }

        return {
          ...serializeUser(friend),

          friendsSince: friendship.acceptedAt,
        };
      })
      .filter(Boolean);

    return res.status(200).json({
      friends,
    });
  } catch (error) {
    console.error("Friend list fetch failed:", error);

    return res.status(500).json({
      error: "FRIEND_LIST_FETCH_FAILED",
    });
  }
});

router.delete("/friends/:userId", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        error: "INVALID_USER_ID",
      });
    }

    const pairKey = buildPairKey(currentUser._id, userId);

    const friendship = await Friendship.findOneAndDelete({
      pairKey,
      status: "accepted",
    });

    if (!friendship) {
      return res.status(404).json({
        error: "NOT_FRIENDS",
      });
    }

    const [currentFriendCount, otherFriendCount] = await Promise.all([
      syncFriendCount(currentUser._id),

      syncFriendCount(userId),
    ]);

    return res.status(200).json({
      message: "FRIEND_REMOVED",

      friendCount: currentFriendCount,

      otherFriendCount,
    });
  } catch (error) {
    console.error("Friend removal failed:", error);

    return res.status(500).json({
      error: "FRIEND_REMOVE_FAILED",
    });
  }
});

router.post("/follows/:userId", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        error: "INVALID_USER_ID",
      });
    }

    if (currentUser._id.toString() === userId) {
      return res.status(400).json({
        error: "CANNOT_FOLLOW_YOURSELF",
      });
    }

    const targetUser = await User.findById(userId);

    if (!targetUser) {
      return res.status(404).json({
        error: "SOCIAL_USER_NOT_FOUND",
      });
    }

    try {
      await Follow.create({
        follower: currentUser._id,

        following: targetUser._id,
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({
          error: "ALREADY_FOLLOWING",
        });
      }

      throw error;
    }

    const [currentCounts, targetCounts] = await Promise.all([
      syncFollowCounts(currentUser._id),

      syncFollowCounts(targetUser._id),
    ]);

    return res.status(201).json({
      message: "USER_FOLLOWED",

      followingCount: currentCounts.followingCount,

      targetFollowerCount: targetCounts.followerCount,
    });
  } catch (error) {
    console.error("Follow user failed:", error);

    return res.status(500).json({
      error: "FOLLOW_USER_FAILED",
    });
  }
});

router.delete("/follows/:userId", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        error: "INVALID_USER_ID",
      });
    }

    const result = await Follow.deleteOne({
      follower: currentUser._id,

      following: userId,
    });

    if (!result.deletedCount) {
      return res.status(404).json({
        error: "NOT_FOLLOWING",
      });
    }

    const [currentCounts, targetCounts] = await Promise.all([
      syncFollowCounts(currentUser._id),

      syncFollowCounts(userId),
    ]);

    return res.status(200).json({
      message: "USER_UNFOLLOWED",

      followingCount: currentCounts.followingCount,

      targetFollowerCount: targetCounts.followerCount,
    });
  } catch (error) {
    console.error("Unfollow user failed:", error);

    return res.status(500).json({
      error: "UNFOLLOW_USER_FAILED",
    });
  }
});

router.get("/users/:username/followers", async (req, res) => {
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

    const targetUser = await User.findOne({
      username,
    });

    if (!targetUser) {
      return res.status(404).json({
        error: "SOCIAL_USER_NOT_FOUND",
      });
    }

    const follows = await Follow.find({
      following: targetUser._id,
    })
      .sort({
        createdAt: -1,
      })
      .limit(100)
      .lean();

    const followerIds = follows.map((follow) => follow.follower);

    const users = await User.find({
      _id: {
        $in: followerIds,
      },
    })
      .select("username name photo friendCount followerCount followingCount")
      .lean();

    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    const followers = follows
      .map((follow) => {
        const user = userMap.get(follow.follower.toString());

        return user
          ? {
              ...serializeUser(user),

              followedAt: follow.createdAt,
            }
          : null;
      })
      .filter(Boolean);

    return res.status(200).json({
      followers,
    });
  } catch (error) {
    console.error("Followers fetch failed:", error);

    return res.status(500).json({
      error: "FOLLOWERS_FETCH_FAILED",
    });
  }
});

router.get("/users/:username/following", async (req, res) => {
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

    const targetUser = await User.findOne({
      username,
    });

    if (!targetUser) {
      return res.status(404).json({
        error: "SOCIAL_USER_NOT_FOUND",
      });
    }

    const follows = await Follow.find({
      follower: targetUser._id,
    })
      .sort({
        createdAt: -1,
      })
      .limit(100)
      .lean();

    const followingIds = follows.map((follow) => follow.following);

    const users = await User.find({
      _id: {
        $in: followingIds,
      },
    })
      .select("username name photo friendCount followerCount followingCount")
      .lean();

    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    const following = follows
      .map((follow) => {
        const user = userMap.get(follow.following.toString());

        return user
          ? {
              ...serializeUser(user),

              followedAt: follow.createdAt,
            }
          : null;
      })
      .filter(Boolean);

    return res.status(200).json({
      following,
    });
  } catch (error) {
    console.error("Following fetch failed:", error);

    return res.status(500).json({
      error: "FOLLOWING_FETCH_FAILED",
    });
  }
});

module.exports = router;
