const SubscriptionPayment = require("../Model/SubscriptionPayment");

const {
  fetchRazorpayPayment,
  fetchRazorpayOrder,
  fetchRazorpayOrderPayments,
  verifyRazorpayPaymentSignature,
} = require("./razorpayService");

const { activatePaidSubscription } = require("./subscriptionService");

const {
  ensureSubscriptionConfirmation,
} = require("./subscriptionEmailService");

const getPaymentRecord = async (userId, paymentRecordId) => {
  const payment = await SubscriptionPayment.findOne({
    _id: paymentRecordId,
    user: userId,
  });

  if (!payment) throw new Error("PAYMENT_RECORD_NOT_FOUND");
  return payment;
};

const validateGatewayPayment = (payment, gatewayPayment) => {
  if (gatewayPayment.order_id !== payment.razorpayOrderId) {
    throw new Error("PAYMENT_ORDER_MISMATCH");
  }

  if (Number(gatewayPayment.amount) !== payment.amount) {
    throw new Error("PAYMENT_AMOUNT_MISMATCH");
  }

  if (gatewayPayment.currency !== "INR") {
    throw new Error("PAYMENT_CURRENCY_MISMATCH");
  }

  if (
    gatewayPayment.status !== "captured" ||
    gatewayPayment.captured !== true
  ) {
    throw new Error("PAYMENT_NOT_CAPTURED");
  }
};

const deliverConfirmation = async (paymentId) => {
  try {
    await ensureSubscriptionConfirmation(paymentId);
  } catch (error) {
    console.error("Subscription confirmation email failed:", error);
  }
};

const settlePayment = async (payment, gatewayPayment) => {
  validateGatewayPayment(payment, gatewayPayment);

  let result;

  try {
    result = await activatePaidSubscription({
      userId: payment.user,
      paymentId: payment._id,
      gatewayPayment,
    });
  } catch (error) {
    if (error.code !== 11000 && error.message !== "PAYMENT_ALREADY_PROCESSED") {
      throw error;
    }

    const latest = await SubscriptionPayment.findById(payment._id);

    if (
      latest?.status !== "paid" ||
      latest.razorpayPaymentId !== gatewayPayment.id ||
      !latest.subscriptionStart ||
      !latest.subscriptionEnd
    ) {
      throw error;
    }

    result = {
      alreadyActivated: true,
      paymentRecordId: latest._id,
      plan: latest.plan,
      cycleStart: latest.subscriptionStart,
      cycleEnd: latest.subscriptionEnd,
      invoiceNumber: latest.invoiceNumber,
    };
  }

  await deliverConfirmation(payment._id);
  return result;
};

const verifySubscriptionPayment = async ({
  userId,
  paymentRecordId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) => {
  const payment = await getPaymentRecord(userId, paymentRecordId);

  if (razorpayOrderId !== payment.razorpayOrderId) {
    throw new Error("PAYMENT_ORDER_MISMATCH");
  }

  const validSignature = verifyRazorpayPaymentSignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });

  if (!validSignature) {
    throw new Error("INVALID_PAYMENT_SIGNATURE");
  }

  if (
    payment.status === "paid" &&
    payment.razorpayPaymentId !== razorpayPaymentId
  ) {
    throw new Error("PAYMENT_ALREADY_PROCESSED");
  }

  const gatewayPayment = await fetchRazorpayPayment(razorpayPaymentId);

  return settlePayment(payment, gatewayPayment);
};

const inspectSubscriptionPayment = async ({ userId, paymentRecordId }) => {
  const payment = await getPaymentRecord(userId, paymentRecordId);

  if (payment.status === "paid") {
    await deliverConfirmation(payment._id);

    return {
      status: "paid",
      paymentRecordId: payment._id,
      plan: payment.plan,
      invoiceNumber: payment.invoiceNumber,
      cycleStart: payment.subscriptionStart,
      cycleEnd: payment.subscriptionEnd,
    };
  }

  const order = await fetchRazorpayOrder(payment.razorpayOrderId);

  if (
    order.id !== payment.razorpayOrderId ||
    Number(order.amount) !== payment.amount ||
    order.currency !== payment.currency
  ) {
    throw new Error("PAYMENT_ORDER_MISMATCH");
  }

  const response = await fetchRazorpayOrderPayments(payment.razorpayOrderId);

  const attempts = Array.isArray(response.items) ? response.items : [];

  const captured = attempts.find(
    (attempt) =>
      attempt.order_id === payment.razorpayOrderId &&
      attempt.status === "captured" &&
      attempt.captured === true,
  );

  if (captured) {
    const verifiedPayment = await fetchRazorpayPayment(captured.id);
    const result = await settlePayment(payment, verifiedPayment);

    return { status: "paid", ...result };
  }

  const authorized = attempts.some(
    (attempt) => attempt.status === "authorized",
  );

  if (authorized) {
    return {
      status: "pending",
      paymentRecordId: payment._id,
      reason: "PAYMENT_AWAITING_CAPTURE",
    };
  }

  const failed = attempts.some((attempt) => attempt.status === "failed");

  return {
    status: payment.status,
    paymentRecordId: payment._id,
    reason: failed ? "PAYMENT_ATTEMPT_FAILED" : "AWAITING_PAYMENT",
    hasFailedAttempt: failed,
  };
};

const closeSubscriptionOrder = async ({ userId, paymentRecordId }) => {
  const result = await inspectSubscriptionPayment({
    userId,
    paymentRecordId,
  });

  if (result.status === "paid") {
    return result;
  }

  if (result.reason === "PAYMENT_AWAITING_CAPTURE") {
    throw new Error("PAYMENT_AWAITING_CAPTURE");
  }

  const updated = await SubscriptionPayment.findOneAndUpdate(
    {
      _id: paymentRecordId,
      user: userId,
      status: "created",
    },
    {
      $set: {
        status: result.hasFailedAttempt ? "failed" : "cancelled",
        failedAt: result.hasFailedAttempt ? new Date() : null,
        cancelledAt: result.hasFailedAttempt ? null : new Date(),
        failureReason: result.hasFailedAttempt
          ? "PAYMENT_ATTEMPT_FAILED"
          : "CHECKOUT_CANCELLED",
      },
    },
    { new: true },
  );

  if (!updated) {
    const latest = await getPaymentRecord(userId, paymentRecordId);
    return { status: latest.status, paymentRecordId: latest._id };
  }

  const finalState = await inspectSubscriptionPayment({
    userId,
    paymentRecordId,
  });

  return finalState.status === "paid"
    ? finalState
    : {
        status: updated.status,
        paymentRecordId: updated._id,
      };
};

module.exports = {
  verifySubscriptionPayment,
  inspectSubscriptionPayment,
  closeSubscriptionOrder,
};
