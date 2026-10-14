const multer = require("multer");

const MAX_MEDIA_SIZE = 50 * 1024 * 1024;

const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const storage = multer.memoryStorage();

const uploadPostMedia = multer({
  storage,
  limits: {
    fileSize: MAX_MEDIA_SIZE,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    if (!ALLOWED_MEDIA_TYPES.has(file.mimetype)) {
      const error = new Error("UNSUPPORTED_MEDIA_TYPE");
      error.code = "UNSUPPORTED_MEDIA_TYPE";

      return callback(error);
    }

    callback(null, true);
  },
});

module.exports = uploadPostMedia;
