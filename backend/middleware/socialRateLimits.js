const { rateLimit } = require("express-rate-limit");

const createUserRateLimiter = ({ windowMs, limit, scope }) => {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,

    keyGenerator: (req) => {
      return req.firebaseUser.uid;
    },

    handler: (req, res) => {
      const resetTime = req.rateLimit?.resetTime;

      const retryAfterSeconds = resetTime
        ? Math.max(
            Math.ceil((new Date(resetTime).getTime() - Date.now()) / 1000),
            1,
          )
        : null;

      return res.status(429).json({
        error: "SOCIAL_RATE_LIMITED",
        scope,
        ...(retryAfterSeconds
          ? {
              retryAfterSeconds,
            }
          : {}),
      });
    },
  });
};

const postCreationLimiter = createUserRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  scope: "post_creation",
});

const mediaUploadLimiter = createUserRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  scope: "media_upload",
});

const commentCreationLimiter = createUserRateLimiter({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  scope: "comment_creation",
});

const reportCreationLimiter = createUserRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  scope: "report_creation",
});

const relationshipActionLimiter = createUserRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  scope: "relationship_action",
});

module.exports = {
  postCreationLimiter,
  mediaUploadLimiter,
  commentCreationLimiter,
  reportCreationLimiter,
  relationshipActionLimiter,
};
