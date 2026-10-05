const axios = require("axios");

const templates = {
  en: {
    otp: (otp) =>
      `Internshala password reset code: ${otp}. This code expires in 10 minutes. Do not share it with anyone.`,

    password: (password) =>
      `Your temporary Internshala password is: ${password}. Sign in with it and change your password immediately.`,
  },

  es: {
    otp: (otp) =>
      `Código de restablecimiento de contraseña de Internshala: ${otp}. Caduca en 10 minutos. No lo compartas con nadie.`,

    password: (password) =>
      `Tu contraseña temporal de Internshala es: ${password}. Inicia sesión con ella y cambia tu contraseña inmediatamente.`,
  },

  hi: {
    otp: (otp) =>
      `Internshala पासवर्ड रीसेट कोड: ${otp}। यह कोड 10 मिनट में समाप्त हो जाएगा। इसे किसी के साथ साझा न करें।`,

    password: (password) =>
      `आपका अस्थायी Internshala पासवर्ड है: ${password}। इससे लॉग इन करें और तुरंत अपना पासवर्ड बदलें।`,
  },

  pt: {
    otp: (otp) =>
      `Código de redefinição de senha do Internshala: ${otp}. Expira em 10 minutos. Não compartilhe com ninguém.`,

    password: (password) =>
      `Sua senha temporária do Internshala é: ${password}. Entre com ela e altere sua senha imediatamente.`,
  },

  zh: {
    otp: (otp) =>
      `Internshala 密码重置验证码：${otp}。验证码将在 10 分钟后过期。请勿与任何人分享。`,

    password: (password) =>
      `您的 Internshala 临时密码是：${password}。请使用该密码登录并立即更改密码。`,
  },

  fr: {
    otp: (otp) =>
      `Code de réinitialisation du mot de passe Internshala : ${otp}. Il expire dans 10 minutes. Ne le partagez avec personne.`,

    password: (password) =>
      `Votre mot de passe temporaire Internshala est : ${password}. Connectez-vous avec celui-ci et changez-le immédiatement.`,
  },
};

const normalizeLanguage = (language) => {
  if (!language) {
    return "en";
  }

  const normalized = language.toLowerCase().split("-")[0];

  return templates[normalized] ? normalized : "en";
};

const normalizePhoneNumber = (phoneNumber) => {
  if (typeof phoneNumber !== "string") {
    return "";
  }

  return phoneNumber.replace(/[\s()-]/g, "").trim();
};

const isValidE164PhoneNumber = (phoneNumber) => {
  return /^\+[1-9]\d{7,14}$/.test(phoneNumber);
};

const normalizeBaseUrl = (baseUrl) => {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    return "";
  }

  let normalized = baseUrl.trim().replace(/\/+$/, "");

  if (!normalized.startsWith("https://") && !normalized.startsWith("http://")) {
    normalized = `https://${normalized}`;
  }

  return normalized;
};

const validateInfobipConfig = () => {
  if (!process.env.INFOBIP_API_KEY) {
    throw new Error("INFOBIP_API_KEY_MISSING");
  }

  if (!process.env.INFOBIP_BASE_URL) {
    throw new Error("INFOBIP_BASE_URL_MISSING");
  }
};

const sendSms = async ({ phoneNumber, message }) => {
  try {
    validateInfobipConfig();

    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    if (!isValidE164PhoneNumber(normalizedPhone)) {
      throw new Error("INVALID_PHONE_NUMBER");
    }

    const baseUrl = normalizeBaseUrl(process.env.INFOBIP_BASE_URL);

    const destination = normalizedPhone.slice(1);

    const sender = process.env.INFOBIP_SENDER || "ServiceSMS";

    const response = await axios.post(
      `${baseUrl}/sms/3/messages`,
      {
        messages: [
          {
            sender,

            destinations: [
              {
                to: destination,
              },
            ],

            content: {
              text: message,
            },
          },
        ],
      },
      {
        headers: {
          Authorization: `App ${process.env.INFOBIP_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },

        timeout: 10000,
      },
    );

    const sentMessage = response.data?.messages?.[0];

    if (!sentMessage?.messageId) {
      console.error("Infobip SMS rejected: missing message ID", {
        status: sentMessage?.status || null,
      });

      throw new Error("INFOBIP_MESSAGE_NOT_ACCEPTED");
    }

    const statusGroup = sentMessage.status?.groupName;

    if (
      statusGroup &&
      statusGroup !== "PENDING" &&
      statusGroup !== "DELIVERED"
    ) {
      console.error("Infobip SMS rejected:", {
        messageId: sentMessage.messageId,
        status: sentMessage.status,
      });

      throw new Error("INFOBIP_MESSAGE_REJECTED");
    }

    return {
      messageId: sentMessage.messageId,
      status: sentMessage.status?.name || statusGroup || "ACCEPTED",
    };
  } catch (error) {
    console.error("Password reset SMS delivery failed:", {
      provider: "Infobip",
      httpStatus: error.response?.status || null,
      providerError:
        error.response?.data?.requestError?.serviceException?.text ||
        error.response?.data?.requestError?.serviceException?.messageId ||
        error.response?.data?.error?.message ||
        error.message ||
        "Unknown Infobip error",
    });

    throw new Error("PASSWORD_RESET_SMS_FAILED");
  }
};

const sendPasswordResetOtpSms = async ({
  phoneNumber,
  otp,
  language = "en",
}) => {
  const currentLanguage = normalizeLanguage(language);

  return sendSms({
    phoneNumber,
    message: templates[currentLanguage].otp(otp),
  });
};

const sendTemporaryPasswordSms = async ({
  phoneNumber,
  password,
  language = "en",
}) => {
  const currentLanguage = normalizeLanguage(language);

  return sendSms({
    phoneNumber,
    message: templates[currentLanguage].password(password),
  });
};

module.exports = {
  normalizePhoneNumber,
  isValidE164PhoneNumber,
  sendPasswordResetOtpSms,
  sendTemporaryPasswordSms,
};
