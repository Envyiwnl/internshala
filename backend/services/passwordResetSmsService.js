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

const validateTwilioConfig = () => {
  if (
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_PHONE_NUMBER
  ) {
    throw new Error("TWILIO_CONFIGURATION_MISSING");
  }
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

const sendSms = async ({ phoneNumber, message }) => {
  validateTwilioConfig();

  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  if (!isValidE164PhoneNumber(normalizedPhone)) {
    throw new Error("INVALID_PHONE_NUMBER");
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;

  const body = new URLSearchParams();

  body.append("To", normalizedPhone);
  body.append("From", process.env.TWILIO_PHONE_NUMBER);
  body.append("Body", message);

  try {
    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      body.toString(),
      {
        auth: {
          username: accountSid,
          password: process.env.TWILIO_AUTH_TOKEN,
        },

        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },

        timeout: 10000,
      },
    );

    return {
      sid: response.data.sid,
      status: response.data.status,
    };
  } catch (error) {
    console.error(
      "Password reset SMS delivery failed:",
      error.response?.data?.message || error.message,
    );

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
