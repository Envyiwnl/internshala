const crypto = require("node:crypto");

const ADMIN_SESSION_EXPIRY_MS =
  8 * 60 * 60 * 1000;

const getAdminSessionSecret = () => {
  const secret =
    process.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    throw new Error(
      "ADMIN_SESSION_SECRET_NOT_CONFIGURED",
    );
  }

  return secret;
};

const signPayload = (payload) => {
  return crypto
    .createHmac(
      "sha256",
      getAdminSessionSecret(),
    )
    .update(payload)
    .digest("base64url");
};

const createAdminSession = () => {
  const now = Date.now();

  const payload = {
    sub: "admin",
    createdAt: now,
    expiresAt:
      now + ADMIN_SESSION_EXPIRY_MS,
  };

  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
  ).toString("base64url");

  const signature =
    signPayload(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,

    expiresAt: new Date(
      payload.expiresAt,
    ),
  };
};

const verifyAdminSessionToken = (
  token,
) => {
  if (
    typeof token !== "string" ||
    !token
  ) {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [
    encodedPayload,
    signature,
  ] = parts;

  if (
    !encodedPayload ||
    !signature
  ) {
    return null;
  }

  const expectedSignature =
    signPayload(encodedPayload);

  const receivedBuffer =
    Buffer.from(signature);

  const expectedBuffer =
    Buffer.from(expectedSignature);

  if (
    receivedBuffer.length !==
    expectedBuffer.length
  ) {
    return null;
  }

  if (
    !crypto.timingSafeEqual(
      receivedBuffer,
      expectedBuffer,
    )
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(
        encodedPayload,
        "base64url",
      ).toString("utf8"),
    );

    if (
      payload.sub !== "admin" ||
      !Number.isFinite(
        payload.expiresAt,
      )
    ) {
      return null;
    }

    if (
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};

module.exports = {
  createAdminSession,
  verifyAdminSessionToken,
};