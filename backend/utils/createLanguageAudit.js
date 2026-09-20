const { UAParser } = require("ua-parser-js");

const LanguageHistory = require("../Model/LanguageHistory");

const createLanguageAudit = async ({
  req,
  user,
  previousLanguage,
  selectedLanguage,
  verificationMethod,
}) => {
  const userAgent = req.get("user-agent") || "";

  const parser = new UAParser(userAgent);

  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();

  await LanguageHistory.create({
    user: user._id,

    previousLanguage,
    selectedLanguage,

    verificationMethod,

    ipAddress: req.ip || "",

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
  });
};

module.exports = createLanguageAudit;
