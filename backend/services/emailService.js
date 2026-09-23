const axios = require("axios");

const emailTemplates = {
  en: {
    subject: "French language verification code",
    heading: "Language verification",
    request: "You requested to change your website language to French.",
    codeLabel: "Your verification code is:",
    expires: "This code expires in 10 minutes.",
    ignore: "If you did not request this change, you can ignore this email.",
  },

  es: {
    subject: "Código de verificación para el idioma francés",
    heading: "Verificación de idioma",
    request: "Has solicitado cambiar el idioma del sitio web al francés.",
    codeLabel: "Tu código de verificación es:",
    expires: "Este código caduca en 10 minutos.",
    ignore:
      "Si no solicitaste este cambio, puedes ignorar este correo electrónico.",
  },

  hi: {
    subject: "फ़्रेंच भाषा सत्यापन कोड",
    heading: "भाषा सत्यापन",
    request: "आपने वेबसाइट की भाषा फ़्रेंच में बदलने का अनुरोध किया है।",
    codeLabel: "आपका सत्यापन कोड है:",
    expires: "यह कोड 10 मिनट में समाप्त हो जाएगा।",
    ignore:
      "यदि आपने इस बदलाव का अनुरोध नहीं किया है, तो आप इस ईमेल को अनदेखा कर सकते हैं।",
  },

  pt: {
    subject: "Código de verificação do idioma francês",
    heading: "Verificação de idioma",
    request: "Você solicitou alterar o idioma do site para francês.",
    codeLabel: "Seu código de verificação é:",
    expires: "Este código expira em 10 minutos.",
    ignore: "Se você não solicitou esta alteração, pode ignorar este e-mail.",
  },

  zh: {
    subject: "法语语言验证码",
    heading: "语言验证",
    request: "您请求将网站语言更改为法语。",
    codeLabel: "您的验证码是：",
    expires: "此验证码将在 10 分钟后过期。",
    ignore: "如果您没有请求此更改，可以忽略此电子邮件。",
  },

  fr: {
    subject: "Code de vérification pour la langue française",
    heading: "Vérification de la langue",
    request: "Vous avez demandé à changer la langue du site en français.",
    codeLabel: "Votre code de vérification est :",
    expires: "Ce code expire dans 10 minutes.",
    ignore:
      "Si vous n'avez pas demandé ce changement, vous pouvez ignorer cet e-mail.",
  },
};

const normalizeLanguage = (language) => {
  if (!language) {
    return "en";
  }

  const normalized = language.toLowerCase().split("-")[0];

  return emailTemplates[normalized] ? normalized : "en";
};

const sendFrenchLanguageOtp = async ({ email, otp, language = "en" }) => {
  try {
    const normalizedLanguage = normalizeLanguage(language);

    const template = emailTemplates[normalizedLanguage];

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

${template.request}

${template.codeLabel} ${otp}

${template.expires}

${template.ignore}
            `.trim(),

            HTMLPart: `
              <div>
                <h2>
                  ${template.heading}
                </h2>

                <p>
                  ${template.request}
                </p>

                <p>
                  ${template.codeLabel}
                </p>

                <h1>
                  ${otp}
                </h1>

                <p>
                  ${template.expires}
                </p>

                <p>
                  ${template.ignore}
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
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      "Mailjet email error:",
      error.response?.data || error.message,
    );

    throw new Error("Failed to send OTP email");
  }
};

module.exports = {
  sendFrenchLanguageOtp,
};
