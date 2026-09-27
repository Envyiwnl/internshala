const Razorpay = require("razorpay");
const crypto = require("node:crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const createResumePaymentOrder = async ({ amount = 5000, receipt }) => {
  return razorpay.orders.create({
    amount,
    currency: "INR",
    receipt,
  });
};

const fetchRazorpayPayment = async (razorpayPaymentId) => {
  return razorpay.payments.fetch(razorpayPaymentId);
};

const verifyRazorpayPaymentSignature = ({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) => {
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  const receivedBuffer = Buffer.from(razorpaySignature, "hex");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

const fetchRazorpayOrder = async (orderId) => {
  return razorpay.orders.fetch(orderId);
};

const fetchRazorpayOrderPayments = async (orderId) => {
  return razorpay.orders.fetchPayments(orderId);
};

module.exports = {
  createResumePaymentOrder,
  verifyRazorpayPaymentSignature,
  fetchRazorpayPayment,
  fetchRazorpayOrder,
  fetchRazorpayOrderPayments,
};
