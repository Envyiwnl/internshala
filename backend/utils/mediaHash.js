const crypto = require("crypto");

const buildMediaHash = (buffer) => {
  return crypto.createHash("sha256").update(buffer).digest("hex");
};

module.exports = {
  buildMediaHash,
};
