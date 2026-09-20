const nodemailer = require("nodemailer");
const dns = require("node:dns").promises;

const createTransporter = async () => {
  const addresses = await dns.resolve4("smtp.gmail.com");

  if (!addresses.length) {
    throw new Error("Unable to resolve Gmail SMTP IPv4 address");
  }

  const ipv4Address = addresses[0];

  return nodemailer.createTransport({
    host: ipv4Address,
    port: 465,
    secure: true,

    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },

    tls: {
      servername: "smtp.gmail.com",
    },
  });
};

const sendFrenchLanguageOtp = async ({ email, otp }) => {
  const transporter = await createTransporter();

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

        <p>This code expires in 10 minutes.</p>

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
