const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendFrenchLanguageOtp = async ({ email, otp }) => {
  const { data, error } = await resend.emails.send({
    from: "Internshala <onboarding@resend.dev>",
    to: email,
    subject: "French language verification code",

    html: `
      <div>
        <h2>Language verification</h2>

        <p>
          You requested to change your website language to French.
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
  });

  if (error) {
    throw new Error(error.message || "Failed to send OTP email");
  }

  return data;
};

module.exports = {
  sendFrenchLanguageOtp,
};
