const axios = require("axios");
const net = require("node:net");

const getRequestAudit = require("./getRequestAudit");

const IST_OFFSET_MINUTES = 5 * 60 + 30;
const MOBILE_LOGIN_START_MINUTES = 10 * 60;
const MOBILE_LOGIN_END_MINUTES = 13 * 60;

const emptyLocation = () => ({
  city: "",
  region: "",
  country: "",
  countryCode: "",
  latitude: null,
  longitude: null,
  timezone: "",
});

const normalizeDeviceType = (deviceType) => {
  const type =
    typeof deviceType === "string" ? deviceType.trim().toLowerCase() : "";

  if (type === "mobile" || type === "smartphone") {
    return "mobile";
  }

  if (type === "tablet") {
    return "tablet";
  }

  if (type === "laptop" || type === "notebook") {
    return "laptop";
  }

  if (!type || type === "desktop") {
    return "desktop";
  }

  return "unknown";
};

const normalizeIpAddress = (ipAddress) => {
  if (typeof ipAddress !== "string") {
    return "";
  }

  const value = ipAddress.trim();

  if (value.startsWith("::ffff:")) {
    return value.slice(7);
  }

  return value;
};

const isPrivateIpv4 = (ipAddress) => {
  const parts = ipAddress.split(".").map(Number);

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [first, second] = parts;

  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
};

const isPublicIpAddress = (ipAddress) => {
  const normalizedIp = normalizeIpAddress(ipAddress);

  const version = net.isIP(normalizedIp);

  if (!version) {
    return false;
  }

  if (version === 4) {
    return !isPrivateIpv4(normalizedIp);
  }

  const lower = normalizedIp.toLowerCase();

  if (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80:")
  ) {
    return false;
  }

  return true;
};

const getApproximateLocation = async (ipAddress) => {
  const normalizedIp = normalizeIpAddress(ipAddress);

  if (!isPublicIpAddress(normalizedIp)) {
    return emptyLocation();
  }

  try {
    const response = await axios.get(
      `https://ipwho.is/${encodeURIComponent(normalizedIp)}`,
      {
        timeout: 3000,
      },
    );

    const data = response.data;

    if (!data?.success) {
      return emptyLocation();
    }

    return {
      city: data.city || "",
      region: data.region || "",
      country: data.country || "",
      countryCode: data.country_code || "",
      latitude: typeof data.latitude === "number" ? data.latitude : null,
      longitude: typeof data.longitude === "number" ? data.longitude : null,
      timezone: data.timezone?.id || "",
    };
  } catch (error) {
    console.error("Login location lookup failed:", {
      message: error.message,
      ipAddress: normalizedIp,
    });

    return emptyLocation();
  }
};

const isGoogleChrome = (audit) => {
  const browserName = audit?.browser?.name?.trim().toLowerCase() || "";

  return ["chrome", "chrome mobile", "chrome mobile ios"].includes(browserName);
};

const isMobileDevice = (audit) => {
  return audit?.device?.type === "mobile";
};

const getIstMinutesSinceMidnight = (date = new Date()) => {
  const istDate = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);

  return istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
};

const isWithinMobileLoginWindow = (date = new Date()) => {
  const minutes = getIstMinutesSinceMidnight(date);

  return (
    minutes >= MOBILE_LOGIN_START_MINUTES && minutes < MOBILE_LOGIN_END_MINUTES
  );
};

const getLoginRequestAudit = async (req) => {
  const audit = getRequestAudit(req);

  const normalizedAudit = {
    ...audit,

    ipAddress: normalizeIpAddress(audit.ipAddress),

    device: {
      ...audit.device,

      type: normalizeDeviceType(audit.device?.type),
    },
  };

  const location = await getApproximateLocation(normalizedAudit.ipAddress);

  return {
    ...normalizedAudit,

    location,
  };
};

module.exports = {
  MOBILE_LOGIN_START_MINUTES,
  MOBILE_LOGIN_END_MINUTES,

  normalizeDeviceType,
  normalizeIpAddress,
  isPublicIpAddress,

  getApproximateLocation,
  getLoginRequestAudit,

  isGoogleChrome,
  isMobileDevice,
  isWithinMobileLoginWindow,
};
