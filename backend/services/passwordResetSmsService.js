const axios = require("axios");

const TRACCAR_SMS_URL = "https://www.traccar.org/sms/";

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

const validateTraccarConfig = () => {
  if (!process.env.TRACCAR_SMS_TOKEN) {
    throw new Error("TRACCAR_SMS_TOKEN_MISSING");
  }
};

const sendSms = async ({ phoneNumber, message }) => {
  try {
    validateTraccarConfig();

    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    if (!isValidE164PhoneNumber(normalizedPhone)) {
      throw new Error("INVALID_PHONE_NUMBER");
    }

    const response = await axios.post(
      TRACCAR_SMS_URL,
      {
        to: normalizedPhone,
        message,
      },
      {
        headers: {
          Authorization: process.env.TRACCAR_SMS_TOKEN,
          "Content-Type": "application/json",
          Accept: "application/json",
        },

        timeout: 10000,
      },
    );

    const data = response.data;

    const successfulResponse =
      data?.successCount > 0 &&
      data?.failureCount === 0 &&
      data?.responses?.some((item) => item?.success === true);

    if (!successfulResponse) {
      console.error("Traccar SMS gateway rejected message:", {
        successCount: data?.successCount ?? null,
        failureCount: data?.failureCount ?? null,
        responses:
          data?.responses?.map((item) => ({
            success: item?.success,
            error: item?.error || null,
          })) || [],
      });

      throw new Error("TRACCAR_SMS_NOT_ACCEPTED");
    }

    const successfulMessage = data.responses.find(
      (item) => item?.success === true,
    );

    return {
      messageId: successfulMessage?.messageId || null,

      status: "ACCEPTED",
    };
  } catch (error) {
    console.error("Password reset SMS delivery failed:", {
      provider: "Traccar SMS Gateway",

      httpStatus: error.response?.status || null,

      providerError:
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Unknown Traccar SMS Gateway error",
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
