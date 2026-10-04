const axios = require("axios");

const templates = {
  en: {
    otp: {
      subject: "Password reset verification code",
      heading: "Password reset verification",
      message:
        "We received a request to reset the password for your Internshala account.",
      codeLabel: "Your verification code is:",
      expiry: "This code expires in 10 minutes.",
      warning:
        "If you did not request a password reset, you can ignore this email.",
    },

    password: {
      subject: "Your temporary Internshala password",
      heading: "Password reset completed",
      message:
        "Your identity has been verified and a temporary password has been generated for your account.",
      passwordLabel: "Your temporary password is:",
      instruction:
        "Use this password to sign in. You will be required to change it immediately after your next successful login.",
      warning:
        "Do not share this password with anyone. If you did not request this reset, contact support immediately.",
    },
  },

  es: {
    otp: {
      subject: "Código de verificación para restablecer la contraseña",
      heading: "Verificación de restablecimiento de contraseña",
      message:
        "Recibimos una solicitud para restablecer la contraseña de tu cuenta de Internshala.",
      codeLabel: "Tu código de verificación es:",
      expiry: "Este código caduca en 10 minutos.",
      warning:
        "Si no solicitaste restablecer tu contraseña, puedes ignorar este correo electrónico.",
    },

    password: {
      subject: "Tu contraseña temporal de Internshala",
      heading: "Restablecimiento de contraseña completado",
      message:
        "Tu identidad ha sido verificada y se ha generado una contraseña temporal para tu cuenta.",
      passwordLabel: "Tu contraseña temporal es:",
      instruction:
        "Utiliza esta contraseña para iniciar sesión. Deberás cambiarla inmediatamente después de iniciar sesión correctamente.",
      warning:
        "No compartas esta contraseña con nadie. Si no solicitaste este restablecimiento, contacta con soporte inmediatamente.",
    },
  },

  hi: {
    otp: {
      subject: "पासवर्ड रीसेट सत्यापन कोड",
      heading: "पासवर्ड रीसेट सत्यापन",
      message:
        "हमें आपके Internshala खाते का पासवर्ड रीसेट करने का अनुरोध प्राप्त हुआ है।",
      codeLabel: "आपका सत्यापन कोड है:",
      expiry: "यह कोड 10 मिनट में समाप्त हो जाएगा।",
      warning:
        "यदि आपने पासवर्ड रीसेट का अनुरोध नहीं किया है, तो आप इस ईमेल को अनदेखा कर सकते हैं।",
    },

    password: {
      subject: "आपका अस्थायी Internshala पासवर्ड",
      heading: "पासवर्ड रीसेट पूरा हुआ",
      message:
        "आपकी पहचान सत्यापित हो गई है और आपके खाते के लिए एक अस्थायी पासवर्ड बनाया गया है।",
      passwordLabel: "आपका अस्थायी पासवर्ड है:",
      instruction:
        "साइन इन करने के लिए इस पासवर्ड का उपयोग करें। अगली सफल लॉगिन के बाद आपको इसे तुरंत बदलना होगा।",
      warning:
        "इस पासवर्ड को किसी के साथ साझा न करें। यदि आपने यह रीसेट अनुरोध नहीं किया है, तो तुरंत सहायता से संपर्क करें।",
    },
  },

  pt: {
    otp: {
      subject: "Código de verificação para redefinição de senha",
      heading: "Verificação de redefinição de senha",
      message:
        "Recebemos uma solicitação para redefinir a senha da sua conta Internshala.",
      codeLabel: "Seu código de verificação é:",
      expiry: "Este código expira em 10 minutos.",
      warning:
        "Se você não solicitou a redefinição de senha, pode ignorar este e-mail.",
    },

    password: {
      subject: "Sua senha temporária do Internshala",
      heading: "Redefinição de senha concluída",
      message:
        "Sua identidade foi verificada e uma senha temporária foi gerada para sua conta.",
      passwordLabel: "Sua senha temporária é:",
      instruction:
        "Use esta senha para entrar. Você deverá alterá-la imediatamente após o próximo login bem-sucedido.",
      warning:
        "Não compartilhe esta senha com ninguém. Se você não solicitou esta redefinição, entre em contato com o suporte imediatamente.",
    },
  },

  zh: {
    otp: {
      subject: "密码重置验证码",
      heading: "密码重置验证",
      message: "我们收到了重置您的 Internshala 帐户密码的请求。",
      codeLabel: "您的验证码是：",
      expiry: "此验证码将在 10 分钟后过期。",
      warning: "如果您没有请求重置密码，可以忽略此电子邮件。",
    },

    password: {
      subject: "您的 Internshala 临时密码",
      heading: "密码重置已完成",
      message: "您的身份已验证，并已为您的帐户生成临时密码。",
      passwordLabel: "您的临时密码是：",
      instruction: "使用此密码登录。下次成功登录后，系统将要求您立即更改密码。",
      warning:
        "请勿与任何人分享此密码。如果您没有请求此次重置，请立即联系支持人员。",
    },
  },

  fr: {
    otp: {
      subject: "Code de vérification pour la réinitialisation du mot de passe",
      heading: "Vérification de la réinitialisation du mot de passe",
      message:
        "Nous avons reçu une demande de réinitialisation du mot de passe de votre compte Internshala.",
      codeLabel: "Votre code de vérification est :",
      expiry: "Ce code expire dans 10 minutes.",
      warning:
        "Si vous n'avez pas demandé de réinitialisation de mot de passe, vous pouvez ignorer cet e-mail.",
    },

    password: {
      subject: "Votre mot de passe temporaire Internshala",
      heading: "Réinitialisation du mot de passe terminée",
      message:
        "Votre identité a été vérifiée et un mot de passe temporaire a été généré pour votre compte.",
      passwordLabel: "Votre mot de passe temporaire est :",
      instruction:
        "Utilisez ce mot de passe pour vous connecter. Vous devrez le modifier immédiatement après votre prochaine connexion réussie.",
      warning:
        "Ne partagez ce mot de passe avec personne. Si vous n'avez pas demandé cette réinitialisation, contactez immédiatement le support.",
    },
  },
};

const normalizeLanguage = (language) => {
  if (!language) {
    return "en";
  }

  const normalized = language.toLowerCase().split("-")[0];

  return templates[normalized] ? normalized : "en";
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

const sendMail = async ({ email, subject, text, html }) => {
  validateMailjetConfig();

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

            Subject: subject,
            TextPart: text,
            HTMLPart: html,
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
    console.error(
      "Password reset email delivery failed:",
      error.response?.data || error.message,
    );

    throw new Error("PASSWORD_RESET_EMAIL_FAILED");
  }
};

const sendPasswordResetOtp = async ({ email, otp, language = "en" }) => {
  const currentLanguage = normalizeLanguage(language);
  const template = templates[currentLanguage].otp;

  return sendMail({
    email,

    subject: template.subject,

    text: `
${template.heading}

${template.message}

${template.codeLabel} ${otp}

${template.expiry}

${template.warning}
    `.trim(),

    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>${template.heading}</h2>

        <p>${template.message}</p>

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

        <p>${template.warning}</p>
      </div>
    `,
  });
};

const sendTemporaryPassword = async ({ email, password, language = "en" }) => {
  const currentLanguage = normalizeLanguage(language);
  const template = templates[currentLanguage].password;

  return sendMail({
    email,

    subject: template.subject,

    text: `
${template.heading}

${template.message}

${template.passwordLabel} ${password}

${template.instruction}

${template.warning}
    `.trim(),

    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>${template.heading}</h2>

        <p>${template.message}</p>

        <p>${template.passwordLabel}</p>

        <div
          style="
            display: inline-block;
            padding: 12px 20px;
            margin: 8px 0;
            font-size: 22px;
            font-weight: bold;
            letter-spacing: 2px;
            background: #f3f4f6;
            border-radius: 8px;
          "
        >
          ${password}
        </div>

        <p>${template.instruction}</p>

        <p><strong>${template.warning}</strong></p>
      </div>
    `,
  });
};

module.exports = {
  sendPasswordResetOtp,
  sendTemporaryPassword,
};
