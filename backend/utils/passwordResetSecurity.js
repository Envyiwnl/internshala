const crypto = require("node:crypto");

const OTP_LENGTH = 6;
const TEMPORARY_PASSWORD_LENGTH = 14;

const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const LETTERS = `${UPPERCASE}${LOWERCASE}`;

const getHashSecret = () => {
  const secret = process.env.OTP_HASH_SECRET;

  if (!secret) {
    throw new Error("OTP_HASH_SECRET_MISSING");
  }

  return secret;
};

const randomCharacter = (characters) => {
  return characters[crypto.randomInt(0, characters.length)];
};

const secureShuffle = (characters) => {
  const values = [...characters];

  for (let index = values.length - 1; index > 0; index -= 1) {
    const randomIndex = crypto.randomInt(0, index + 1);

    [values[index], values[randomIndex]] = [values[randomIndex], values[index]];
  }

  return values.join("");
};

const timingSafeHexCompare = (first, second) => {
  if (
    typeof first !== "string" ||
    typeof second !== "string" ||
    !/^[a-f0-9]+$/i.test(first) ||
    !/^[a-f0-9]+$/i.test(second)
  ) {
    return false;
  }

  const firstBuffer = Buffer.from(first, "hex");
  const secondBuffer = Buffer.from(second, "hex");

  if (firstBuffer.length !== secondBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(firstBuffer, secondBuffer);
};

const generateOtp = () => {
  const minimum = 10 ** (OTP_LENGTH - 1);
  const maximum = 10 ** OTP_LENGTH;

  return crypto.randomInt(minimum, maximum).toString();
};

const hashOtp = ({ userId, otp }) => {
  if (!userId || !otp) {
    throw new Error("OTP_HASH_INPUT_MISSING");
  }

  return crypto
    .createHmac("sha256", getHashSecret())
    .update(`password-reset:otp:${userId}:${otp}`)
    .digest("hex");
};

const verifyOtpHash = ({ userId, otp, storedHash }) => {
  if (!userId || !otp || !storedHash) {
    return false;
  }

  const calculatedHash = hashOtp({
    userId,
    otp,
  });

  return timingSafeHexCompare(calculatedHash, storedHash);
};

const generateSessionToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const hashSessionToken = (sessionToken) => {
  if (!sessionToken) {
    throw new Error("SESSION_TOKEN_MISSING");
  }

  return crypto
    .createHmac("sha256", getHashSecret())
    .update(`password-reset:session:${sessionToken}`)
    .digest("hex");
};

const verifySessionTokenHash = ({ sessionToken, storedHash }) => {
  if (!sessionToken || !storedHash) {
    return false;
  }

  const calculatedHash = hashSessionToken(sessionToken);

  return timingSafeHexCompare(calculatedHash, storedHash);
};

const generateTemporaryPassword = (length = TEMPORARY_PASSWORD_LENGTH) => {
  if (!Number.isInteger(length) || length < 8 || length > 64) {
    throw new Error("INVALID_TEMPORARY_PASSWORD_LENGTH");
  }

  const characters = [randomCharacter(UPPERCASE), randomCharacter(LOWERCASE)];

  for (let index = characters.length; index < length; index += 1) {
    characters.push(randomCharacter(LETTERS));
  }

  return secureShuffle(characters);
};

module.exports = {
  OTP_LENGTH,
  TEMPORARY_PASSWORD_LENGTH,

  generateOtp,
  hashOtp,
  verifyOtpHash,

  generateSessionToken,
  hashSessionToken,
  verifySessionTokenHash,

  generateTemporaryPassword,
};
