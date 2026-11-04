const isWithinSubscriptionPaymentWindow = (date = new Date()) => {
  const istMinutes =
    (date.getUTCHours() * 60 + date.getUTCMinutes() + 330) % 1440;

  return istMinutes >= 5 * 60 && istMinutes <= 11 * 60 + 45;
};

const getSubscriptionPaymentWindow = () => ({
  start: "05:00",
  end: "11:45",
  timezone: "Asia/Kolkata",
});

const formatSubscriptionOrder = (payment, reused = false) => ({
  message: reused ? "ORDER_ALREADY_EXISTS" : "ORDER_CREATED",
  paymentRecordId: payment._id,
  order: {
    id: payment.razorpayOrderId,
    amount: payment.amount,
    currency: payment.currency,
  },
  plan: payment.plan,
  action: payment.action,
  keyId: process.env.RAZORPAY_KEY_ID,
  testMode: true,
  reused,
});

module.exports = {
  isWithinSubscriptionPaymentWindow,
  getSubscriptionPaymentWindow,
  formatSubscriptionOrder,
};
