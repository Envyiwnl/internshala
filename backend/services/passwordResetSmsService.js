const axios = require("axios");

const normalizePhoneNumber = (phoneNumber) => {
  if (typeof phoneNumber !== "string") {
    return "";
  }

  return phoneNumber.replace(/[\s()-]/g, "").trim();
};

const isValidE164PhoneNumber = (phoneNumber) => {
  return /^\+[1-9]\d{7,14}$/.test(phoneNumber);
};

const getTwilioConfig = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!accountSid) {
    throw new Error("TWILIO_ACCOUNT_SID_MISSING");
  }

  if (!authToken) {
    throw new Error("TWILIO_AUTH_TOKEN_MISSING");
  }

  if (!serviceSid) {
    throw new Error("TWILIO_VERIFY_SERVICE_SID_MISSING");
  }

  return {
    accountSid,
    authToken,
    serviceSid,
  };
};

const sendPasswordResetOtpSms = async ({ phoneNumber }) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  if (!isValidE164PhoneNumber(normalizedPhone)) {
    throw new Error("INVALID_PHONE_NUMBER");
  }

  try {
    const { accountSid, authToken, serviceSid } = getTwilioConfig();

    const body = new URLSearchParams();

    body.append("To", normalizedPhone);
    body.append("Channel", "sms");

    const response = await axios.post(
      `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
      body.toString(),
      {
        auth: {
          username: accountSid,
          password: authToken,
        },

        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },

        timeout: 10000,
      },
    );

    if (!response.data?.sid || response.data?.status !== "pending") {
      throw new Error("TWILIO_VERIFICATION_NOT_STARTED");
    }

    return {
      verificationSid: response.data.sid,
      status: response.data.status,
    };
  } catch (error) {
    console.error("Twilio Verify OTP delivery failed:", {
      httpStatus: error.response?.status || null,
      twilioCode: error.response?.data?.code || null,
      providerError:
        error.response?.data?.message ||
        error.message ||
        "Unknown Twilio Verify error",
    });

    throw new Error("PASSWORD_RESET_SMS_FAILED");
  }
};

const verifyPasswordResetOtpSms = async ({ phoneNumber, otp }) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  if (!isValidE164PhoneNumber(normalizedPhone)) {
    throw new Error("INVALID_PHONE_NUMBER");
  }

  if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
    throw new Error("INVALID_OTP_FORMAT");
  }

  try {
    const { accountSid, authToken, serviceSid } = getTwilioConfig();

    const body = new URLSearchParams();

    body.append("To", normalizedPhone);
    body.append("Code", otp);

    const response = await axios.post(
      `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
      body.toString(),
      {
        auth: {
          username: accountSid,
          password: authToken,
        },

        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },

        timeout: 10000,
      },
    );

    return {
      approved: response.data?.status === "approved",
      status: response.data?.status || "pending",
      verificationSid: response.data?.sid || null,
    };
  } catch (error) {
    const httpStatus = error.response?.status;
    const twilioCode = error.response?.data?.code;

    if (twilioCode === 60202) {
      return {
        approved: false,
        status: "max_attempts_reached",
        verificationSid: null,
      };
    }

    if (httpStatus === 404) {
      return {
        approved: false,
        status: "not_found",
        verificationSid: null,
      };
    }

    console.error("Twilio Verify OTP validation failed:", {
      httpStatus: httpStatus || null,
      twilioCode: twilioCode || null,
      providerError:
        error.response?.data?.message ||
        error.message ||
        "Unknown Twilio Verify error",
    });

    throw new Error("TWILIO_VERIFICATION_CHECK_FAILED");
  }
};

module.exports = {
  normalizePhoneNumber,
  isValidE164PhoneNumber,
  sendPasswordResetOtpSms,
  verifyPasswordResetOtpSms,
};
