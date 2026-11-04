const crypto = require("node:crypto");

const LOGIN_OTP_LENGTH = 6;

const LOGIN_OTP_EXPIRY_MS = 10 * 60 * 1000;
const LOGIN_CHALLENGE_EXPIRY_MS = 15 * 60 * 1000;
const LOGIN_SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

const LOGIN_OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const MAX_LOGIN_OTP_ATTEMPTS = 5;
const MAX_LOGIN_OTP_RESENDS = 3;

const getSecuritySecret = () => {
  const secret =
    process.env.LOGIN_SECURITY_SECRET || process.env.OTP_HASH_SECRET;

  if (!secret) {
    throw new Error("LOGIN_SECURITY_SECRET_MISSING");
  }

  return secret;
};

const normalizeFingerprintValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
};

const createHmac = (value) => {
  return crypto
    .createHmac("sha256", getSecuritySecret())
    .update(value)
    .digest("hex");
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

const generateLoginOtp = () => {
  const minimum = 10 ** (LOGIN_OTP_LENGTH - 1);
  const maximum = 10 ** LOGIN_OTP_LENGTH;

  return crypto.randomInt(minimum, maximum).toString();
};

const hashLoginOtp = ({ activityId, otp }) => {
  if (!activityId || !otp) {
    throw new Error("LOGIN_OTP_HASH_INPUT_MISSING");
  }

  return createHmac(`login-security:otp:${activityId}:${otp}`);
};

const verifyLoginOtpHash = ({ activityId, otp, storedHash }) => {
  if (!activityId || !otp || !storedHash) {
    return false;
  }

  const calculatedHash = hashLoginOtp({
    activityId,
    otp,
  });

  return timingSafeHexCompare(calculatedHash, storedHash);
};

const generateLoginChallengeToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const hashLoginChallengeToken = (token) => {
  if (!token) {
    throw new Error("LOGIN_CHALLENGE_TOKEN_MISSING");
  }

  return createHmac(`login-security:challenge:${token}`);
};

const verifyLoginChallengeTokenHash = ({ token, storedHash }) => {
  if (!token || !storedHash) {
    return false;
  }

  const calculatedHash = hashLoginChallengeToken(token);

  return timingSafeHexCompare(calculatedHash, storedHash);
};

const generateLoginSessionToken = () => {
  return crypto.randomBytes(48).toString("hex");
};

const hashLoginSessionToken = (token) => {
  if (!token) {
    throw new Error("LOGIN_SESSION_TOKEN_MISSING");
  }

  return createHmac(`login-security:session:${token}`);
};

const verifyLoginSessionTokenHash = ({ token, storedHash }) => {
  if (!token || !storedHash) {
    return false;
  }

  const calculatedHash = hashLoginSessionToken(token);

  return timingSafeHexCompare(calculatedHash, storedHash);
};

const buildBrowserKey = (audit) => {
  const browserName = normalizeFingerprintValue(audit?.browser?.name);

  const browserVersion = normalizeFingerprintValue(audit?.browser?.version);

  const osName = normalizeFingerprintValue(audit?.os?.name);

  const deviceType = normalizeFingerprintValue(audit?.device?.type);

  const userAgent = normalizeFingerprintValue(audit?.userAgent);

  return createHmac(
    [
      "login-security:browser",
      browserName,
      browserVersion,
      osName,
      deviceType,
      userAgent,
    ].join("|"),
  );
};

const buildDeviceKey = (audit) => {
  const osName = normalizeFingerprintValue(audit?.os?.name);

  const osVersion = normalizeFingerprintValue(audit?.os?.version);

  const deviceType = normalizeFingerprintValue(audit?.device?.type);

  const vendor = normalizeFingerprintValue(audit?.device?.vendor);

  const model = normalizeFingerprintValue(audit?.device?.model);

  return createHmac(
    [
      "login-security:device",
      osName,
      osVersion,
      deviceType,
      vendor,
      model,
    ].join("|"),
  );
};

const getOtpExpiresAt = (from = new Date()) => {
  return new Date(from.getTime() + LOGIN_OTP_EXPIRY_MS);
};

const getChallengeExpiresAt = (from = new Date()) => {
  return new Date(from.getTime() + LOGIN_CHALLENGE_EXPIRY_MS);
};

const getSessionExpiresAt = (from = new Date()) => {
  return new Date(from.getTime() + LOGIN_SESSION_EXPIRY_MS);
};

const getOtpResendAvailableAt = (from = new Date()) => {
  return new Date(from.getTime() + LOGIN_OTP_RESEND_COOLDOWN_MS);
};

module.exports = {
  LOGIN_OTP_LENGTH,

  LOGIN_OTP_EXPIRY_MS,
  LOGIN_CHALLENGE_EXPIRY_MS,
  LOGIN_SESSION_EXPIRY_MS,
  LOGIN_OTP_RESEND_COOLDOWN_MS,

  MAX_LOGIN_OTP_ATTEMPTS,
  MAX_LOGIN_OTP_RESENDS,

  generateLoginOtp,
  hashLoginOtp,
  verifyLoginOtpHash,

  generateLoginChallengeToken,
  hashLoginChallengeToken,
  verifyLoginChallengeTokenHash,

  generateLoginSessionToken,
  hashLoginSessionToken,
  verifyLoginSessionTokenHash,

  buildBrowserKey,
  buildDeviceKey,

  getOtpExpiresAt,
  getChallengeExpiresAt,
  getSessionExpiresAt,
  getOtpResendAvailableAt,
};
