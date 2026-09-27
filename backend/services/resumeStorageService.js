const mongoose = require("mongoose");

const BUCKET_NAME = "resumePdfs";

const getBucket = () => {
  if (!mongoose.connection.db) {
    throw new Error("MongoDB connection is not ready");
  }

  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: BUCKET_NAME,
  });
};

const storeResumePdf = async ({ buffer, filename, metadata = {} }) => {
  return new Promise((resolve, reject) => {
    try {
      const bucket = getBucket();

      const uploadStream = bucket.openUploadStream(filename, {
        contentType: "application/pdf",
        metadata,
      });

      uploadStream.on("error", reject);

      uploadStream.on("finish", () => {
        resolve({
          fileId: uploadStream.id,
          filename: uploadStream.filename,
        });
      });

      uploadStream.end(buffer);
    } catch (error) {
      reject(error);
    }
  });
};

const openResumePdfDownloadStream = (fileId) => {
  const bucket = getBucket();

  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    throw new Error("INVALID_FILE_ID");
  }

  return bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
};

const deleteResumePdf = async (fileId) => {
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    throw new Error("INVALID_FILE_ID");
  }

  const bucket = getBucket();

  await bucket.delete(new mongoose.Types.ObjectId(fileId));
};

module.exports = {
  storeResumePdf,
  openResumePdfDownloadStream,
  deleteResumePdf,
};
