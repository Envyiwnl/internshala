const { UAParser } = require("ua-parser-js");

const getRequestAudit = (req) => {
  const userAgent = req.get("user-agent") || "";

  const parser = new UAParser(userAgent);

  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();

  const forwardedFor = req.headers["x-forwarded-for"];

  let ipAddress = "";

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    ipAddress = forwardedFor.split(",")[0].trim();
  } else if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    ipAddress = forwardedFor[0];
  } else {
    ipAddress = req.ip || "";
  }

  return {
    ipAddress,

    userAgent,

    browser: {
      name: browser.name || "",
      version: browser.version || "",
    },

    os: {
      name: os.name || "",
      version: os.version || "",
    },

    device: {
      type: device.type || "desktop",
      vendor: device.vendor || "",
      model: device.model || "",
    },
  };
};

module.exports = getRequestAudit;
