const axios = require("axios");

const sendFrenchLanguageOtp = async ({ email, otp }) => {
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

            Subject: "French language verification code",

            TextPart: `Your verification code is ${otp}. It expires in 10 minutes.`,

            HTMLPart: `
              <div>
                <h2>Language verification</h2>

                <p>
                  You requested to change your website
                  language to French.
                </p>

                <p>Your verification code is:</p>

                <h1>${otp}</h1>

                <p>
                  This code expires in 10 minutes.
                </p>

                <p>
                  If you did not request this change,
                  you can ignore this email.
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
