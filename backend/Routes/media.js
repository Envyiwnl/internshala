const express = require("express");
const mongoose = require("mongoose");

const User = require("../Model/User");
const MediaAsset = require("../Model/MediaAsset");

const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");
const uploadPostMedia = require("../middleware/uploadPostMedia");

const { buildMediaHash } = require("../utils/mediaHash");
const {
  validateMediaFile,
  uploadMediaToCloudinary,
} = require("../utils/uploadMediaToCloudinary");

const cloudinary = require("../config/cloudinary");

const router = express.Router();

router.use(verifyFirebaseToken);

const getCurrentUser = async (req) => {
  return User.findOne({
    firebaseUid: req.firebaseUser.uid,
  });
};

const handleMediaUpload = (req, res, next) => {
  uploadPostMedia.single("media")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "MEDIA_TOO_LARGE",
      });
    }

    if (error.code === "UNSUPPORTED_MEDIA_TYPE") {
      return res.status(400).json({
        error: "UNSUPPORTED_MEDIA_TYPE",
      });
    }

    console.error("Media middleware failed:", error);

    return res.status(400).json({
      error: "MEDIA_UPLOAD_INVALID",
    });
  });
};

router.post("/upload", handleMediaUpload, async (req, res) => {
  let uploadedCloudinaryAsset = null;

  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const validation = validateMediaFile(req.file);

    if (!validation.valid) {
      return res.status(400).json({
        error: validation.error,
        ...(validation.maxBytes
          ? {
              maxBytes: validation.maxBytes,
            }
          : {}),
      });
    }

    const contentHash = buildMediaHash(req.file.buffer);

    const duplicateAsset = await MediaAsset.exists({
      uploader: currentUser._id,
      contentHash,
    });

    if (duplicateAsset) {
      return res.status(409).json({
        error: "DUPLICATE_MEDIA",
      });
    }

    uploadedCloudinaryAsset = await uploadMediaToCloudinary({
      buffer: req.file.buffer,
      resourceType: validation.resourceType,
    });

    let mediaAsset;

    try {
      mediaAsset = await MediaAsset.create({
        uploader: currentUser._id,
        resourceType: validation.resourceType,
        mimeType: req.file.mimetype,
        contentHash,
        cloudinaryPublicId: uploadedCloudinaryAsset.public_id,
        secureUrl: uploadedCloudinaryAsset.secure_url,
        format: uploadedCloudinaryAsset.format || "",
        bytes: uploadedCloudinaryAsset.bytes || req.file.size,
        width: uploadedCloudinaryAsset.width || null,
        height: uploadedCloudinaryAsset.height || null,
        duration:
          validation.resourceType === "video"
            ? uploadedCloudinaryAsset.duration || null
            : null,
      });
    } catch (error) {
      try {
        await cloudinary.uploader.destroy(uploadedCloudinaryAsset.public_id, {
          resource_type: validation.resourceType,
        });
      } catch (cleanupError) {
        console.error("Cloudinary rollback failed:", cleanupError);
      }

      if (error?.code === 11000) {
        return res.status(409).json({
          error: "DUPLICATE_MEDIA",
        });
      }

      throw error;
    }

    return res.status(201).json({
      message: "MEDIA_UPLOADED",
      media: {
        id: mediaAsset._id.toString(),
        resourceType: mediaAsset.resourceType,
        mimeType: mediaAsset.mimeType,
        url: mediaAsset.secureUrl,
        format: mediaAsset.format,
        bytes: mediaAsset.bytes,
        width: mediaAsset.width,
        height: mediaAsset.height,
        duration: mediaAsset.duration,
        createdAt: mediaAsset.createdAt,
      },
    });
  } catch (error) {
    console.error("Media upload failed:", error);

    return res.status(500).json({
      error: "MEDIA_UPLOAD_FAILED",
    });
  }
});

router.delete("/:mediaId", async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const { mediaId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(mediaId)) {
      return res.status(400).json({
        error: "INVALID_MEDIA_ID",
      });
    }

    const mediaAsset = await MediaAsset.findOne({
      _id: mediaId,
      uploader: currentUser._id,
      post: null,
    });

    if (!mediaAsset) {
      return res.status(404).json({
        error: "MEDIA_NOT_AVAILABLE",
      });
    }

    await cloudinary.uploader.destroy(mediaAsset.cloudinaryPublicId, {
      resource_type: mediaAsset.resourceType,
    });

    await MediaAsset.deleteOne({
      _id: mediaAsset._id,
      uploader: currentUser._id,
      post: null,
    });

    return res.status(200).json({
      message: "MEDIA_DELETED",
      mediaId: mediaAsset._id.toString(),
    });
  } catch (error) {
    console.error("Media deletion failed:", error);

    return res.status(500).json({
      error: "MEDIA_DELETE_FAILED",
    });
  }
});

module.exports = router;
