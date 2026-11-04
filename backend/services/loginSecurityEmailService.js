const axios = require("axios");

const templates = {
  en: {
    subject: "Login verification code",
    heading: "Verify your login",
    message:
      "A login to your Internshala account from Google Chrome requires verification.",
    codeLabel: "Your verification code is:",
    expiry: "This code expires in 10 minutes.",
    security:
      "If you did not attempt to sign in, do not share this code with anyone.",
  },

  es: {
    subject: "Código de verificación de inicio de sesión",
    heading: "Verifica tu inicio de sesión",
    message:
      "Un inicio de sesión en tu cuenta de Internshala desde Google Chrome requiere verificación.",
    codeLabel: "Tu código de verificación es:",
    expiry: "Este código caduca en 10 minutos.",
    security:
      "Si no intentaste iniciar sesión, no compartas este código con nadie.",
  },

  hi: {
    subject: "लॉगिन सत्यापन कोड",
    heading: "अपने लॉगिन को सत्यापित करें",
    message:
      "Google Chrome से आपके Internshala खाते में लॉगिन करने के लिए सत्यापन आवश्यक है।",
    codeLabel: "आपका सत्यापन कोड है:",
    expiry: "यह कोड 10 मिनट में समाप्त हो जाएगा।",
    security:
      "यदि आपने लॉगिन करने का प्रयास नहीं किया है, तो यह कोड किसी के साथ साझा न करें।",
  },

  pt: {
    subject: "Código de verificação de login",
    heading: "Verifique seu login",
    message:
      "Um login na sua conta Internshala pelo Google Chrome requer verificação.",
    codeLabel: "Seu código de verificação é:",
    expiry: "Este código expira em 10 minutos.",
    security:
      "Se você não tentou entrar, não compartilhe este código com ninguém.",
  },

  zh: {
    subject: "登录验证码",
    heading: "验证您的登录",
    message: "从 Google Chrome 登录您的 Internshala 帐户需要进行验证。",
    codeLabel: "您的验证码是：",
    expiry: "此验证码将在 10 分钟后过期。",
    security: "如果您没有尝试登录，请不要与任何人分享此验证码。",
  },

  fr: {
    subject: "Code de vérification de connexion",
    heading: "Vérifiez votre connexion",
    message:
      "Une connexion à votre compte Internshala depuis Google Chrome nécessite une vérification.",
    codeLabel: "Votre code de vérification est :",
    expiry: "Ce code expire dans 10 minutes.",
    security:
      "Si vous n'avez pas tenté de vous connecter, ne partagez ce code avec personne.",
  },
};

const normalizeLanguage = (language) => {
  if (typeof language !== "string") {
    return "en";
  }

  const normalized = language.toLowerCase().split("-")[0];

  return templates[normalized] ? normalized : "en";
};

const escapeHtml = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

const validateMailjetConfig = () => {
  if (
    !process.env.MAILJET_API_KEY ||
    !process.env.MAILJET_SECRET_KEY ||
    !process.env.MAILJET_SENDER_EMAIL
  ) {
    throw new Error("MAILJET_CONFIGURATION_MISSING");
  }
};

const sendLoginVerificationOtp = async ({
  email,
  otp,
  language = "en",
  browserName = "",
  deviceType = "",
}) => {
  if (!email || !otp) {
    throw new Error("LOGIN_OTP_EMAIL_INPUT_MISSING");
  }

  validateMailjetConfig();

  const currentLanguage = normalizeLanguage(language);

  const template = templates[currentLanguage];

  const safeBrowserName = escapeHtml(browserName);
  const safeDeviceType = escapeHtml(deviceType);

  const environmentText = [
    browserName ? `Browser: ${browserName}` : "",
    deviceType ? `Device: ${deviceType}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const environmentHtml = [
    safeBrowserName
      ? `<p><strong>Browser:</strong> ${safeBrowserName}</p>`
      : "",
    safeDeviceType ? `<p><strong>Device:</strong> ${safeDeviceType}</p>` : "",
  ]
    .filter(Boolean)
    .join("");

  try {
    const response = await axios.post(
      "https://api.mailjet.com/v3.1/send",
      {
        Messages: [
          {
            From: {
              Email: process.env.MAILJET_SENDER_EMAIL,
              Name: "Internshala",
            },

            To: [
              {
                Email: email,
              },
            ],

            Subject: template.subject,

            TextPart: `
${template.heading}

${template.message}

${environmentText}

${template.codeLabel} ${otp}

${template.expiry}

${template.security}
            `.trim(),

            HTMLPart: `
              <div
                style="
                  font-family: Arial, sans-serif;
                  line-height: 1.6;
                  color: #111827;
                "
              >
                <h2>${template.heading}</h2>

                <p>${template.message}</p>

                ${
                  environmentHtml
                    ? `
                      <div
                        style="
                          margin: 16px 0;
                          padding: 12px 16px;
                          background: #f9fafb;
                          border-radius: 8px;
                        "
                      >
                        ${environmentHtml}
                      </div>
                    `
                    : ""
                }

                <p>${template.codeLabel}</p>

                <div
                  style="
                    display: inline-block;
                    padding: 12px 20px;
                    margin: 8px 0;
                    font-size: 28px;
                    font-weight: bold;
                    letter-spacing: 6px;
                    background: #f3f4f6;
                    border-radius: 8px;
                  "
                >
                  ${otp}
                </div>

                <p>${template.expiry}</p>

                <p>
                  <strong>
                    ${template.security}
                  </strong>
                </p>
              </div>
            `,
          },
        ],
      },
      {
        auth: {
          username: process.env.MAILJET_API_KEY,
          password: process.env.MAILJET_SECRET_KEY,
        },

        headers: {
          "Content-Type": "application/json",
        },

        timeout: 10000,
      },
    );

    return response.data;
  } catch (error) {
    console.error("Login verification email delivery failed:", {
      status: error.response?.status || null,
      providerError:
        error.response?.data || error.message || "Unknown Mailjet error",
    });

    throw new Error("LOGIN_OTP_EMAIL_FAILED");
  }
};

module.exports = {
  sendLoginVerificationOtp,
};
