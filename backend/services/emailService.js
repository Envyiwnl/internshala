const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendFrenchLanguageOtp = async ({ email, otp }) => {
  await transporter.sendMail({
    from: `"Internshala" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "French language verification code",

    text: `Your verification code is ${otp}. It expires in 10 minutes.`,

    html: `
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
  });
};

module.exports = {
  sendFrenchLanguageOtp,
};
