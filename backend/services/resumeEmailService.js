const axios = require("axios");

const templates = {
  en: {
    subject: "Resume payment verification code",
    heading: "Resume payment verification",
    message: "You requested to generate or download a premium resume.",
    codeLabel: "Your verification code is:",
    expiry: "This code expires in 10 minutes.",
    warning: "If you did not request this action, you can ignore this email.",
  },

  es: {
    subject: "Código de verificación para el pago del currículum",
    heading: "Verificación de pago del currículum",
    message: "Has solicitado generar o descargar un currículum premium.",
    codeLabel: "Tu código de verificación es:",
    expiry: "Este código caduca en 10 minutos.",
    warning:
      "Si no solicitaste esta acción, puedes ignorar este correo electrónico.",
  },

  hi: {
    subject: "रिज़्यूमे भुगतान सत्यापन कोड",
    heading: "रिज़्यूमे भुगतान सत्यापन",
    message: "आपने प्रीमियम रिज़्यूमे बनाने या डाउनलोड करने का अनुरोध किया है।",
    codeLabel: "आपका सत्यापन कोड है:",
    expiry: "यह कोड 10 मिनट में समाप्त हो जाएगा।",
    warning:
      "यदि आपने यह अनुरोध नहीं किया है, तो इस ईमेल को अनदेखा कर सकते हैं।",
  },

  pt: {
    subject: "Código de verificação do pagamento do currículo",
    heading: "Verificação de pagamento do currículo",
    message: "Você solicitou gerar ou baixar um currículo premium.",
    codeLabel: "Seu código de verificação é:",
    expiry: "Este código expira em 10 minutos.",
    warning: "Se você não solicitou esta ação, pode ignorar este e-mail.",
  },

  zh: {
    subject: "简历支付验证码",
    heading: "简历支付验证",
    message: "您请求生成或下载高级简历。",
    codeLabel: "您的验证码是：",
    expiry: "此验证码将在 10 分钟后过期。",
    warning: "如果您没有请求此操作，可以忽略此电子邮件。",
  },

  fr: {
    subject: "Code de vérification du paiement du CV",
    heading: "Vérification du paiement du CV",
    message: "Vous avez demandé à générer ou télécharger un CV Premium.",
    codeLabel: "Votre code de vérification est :",
    expiry: "Ce code expire dans 10 minutes.",
    warning:
      "Si vous n'avez pas demandé cette action, vous pouvez ignorer cet e-mail.",
  },
};

const normalizeLanguage = (language) => {
  if (!language) {
    return "en";
  }

  const normalized = language.toLowerCase().split("-")[0];

  return templates[normalized] ? normalized : "en";
};

const sendResumeOtp = async ({ email, otp, language = "en" }) => {
  try {
    const currentLanguage = normalizeLanguage(language);

    const template = templates[currentLanguage];

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

${template.codeLabel} ${otp}

${template.expiry}

${template.warning}
            `.trim(),

            HTMLPart: `
              <div>
                <h2>
                  ${template.heading}
                </h2>

                <p>
                  ${template.message}
                </p>

                <p>
                  ${template.codeLabel}
                </p>

                <h1>
                  ${otp}
                </h1>

                <p>
                  ${template.expiry}
                </p>

                <p>
                  ${template.warning}
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
      "Resume OTP email error:",
      error.response?.data || error.message,
    );

    throw new Error("Failed to send resume OTP email");
  }
};

module.exports = {
  sendResumeOtp,
};
