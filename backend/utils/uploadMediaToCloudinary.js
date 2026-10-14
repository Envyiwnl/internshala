const cloudinary = require("../config/cloudinary");

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const getMediaResourceType = (mimeType) => {
  if (IMAGE_TYPES.has(mimeType)) {
    return "image";
  }

  if (VIDEO_TYPES.has(mimeType)) {
    return "video";
  }

  return null;
};

const validateMediaFile = (file) => {
  if (!file?.buffer) {
    return {
      valid: false,
      error: "MEDIA_FILE_REQUIRED",
    };
  }

  const resourceType = getMediaResourceType(file.mimetype);

  if (!resourceType) {
    return {
      valid: false,
      error: "UNSUPPORTED_MEDIA_TYPE",
    };
  }

  if (resourceType === "image" && file.size > MAX_IMAGE_SIZE) {
    return {
      valid: false,
      error: "IMAGE_TOO_LARGE",
      maxBytes: MAX_IMAGE_SIZE,
    };
  }

  if (resourceType === "video" && file.size > MAX_VIDEO_SIZE) {
    return {
      valid: false,
      error: "VIDEO_TOO_LARGE",
      maxBytes: MAX_VIDEO_SIZE,
    };
  }

  return {
    valid: true,
    resourceType,
  };
};

const uploadMediaToCloudinary = ({ buffer, resourceType }) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        folder: "internshala/public-space",
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve(result);
      },
    );

    uploadStream.end(buffer);
  });
};

module.exports = {
  validateMediaFile,
  uploadMediaToCloudinary,
};
