const mongoose = require("mongoose");
const User = require("../Model/User");
const SubscriptionPayment = require("../Model/SubscriptionPayment");
const SubscriptionHistory = require("../Model/SubscriptionHistory");
const { getSubscriptionPlan } = require("../config/subscriptionPlans");

const addBillingMonth = (date) => {
  const result = new Date(date);
  const day = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);

  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();

  result.setUTCDate(Math.min(day, lastDay));
  return result;
};

const getNextCycle = (start, now) => {
  const origin = new Date(start);
  let next = addBillingMonth(origin);

  while (next <= now) {
    next = addBillingMonth(next);
  }

  return next;
};

const setFreeSubscription = (user, start, end) => {
  user.subscription.plan = "free";
  user.subscription.status = "active";
  user.subscription.applicationLimit = 1;
  user.subscription.applicationsUsed = 0;
  user.subscription.cycleStart = start;
  user.subscription.cycleEnd = end;
  user.subscription.cancelAtPeriodEnd = false;
  user.subscription.scheduledPlan = null;
  user.subscription.lastPayment = null;
};

const recordHistory = async ({
  user,
  action,
  previousPlan,
  newPlan,
  payment = null,
  reason = "",
  session,
}) => {
  await SubscriptionHistory.create(
    [
      {
        user: user._id,
        action,
        previousPlan,
        newPlan,
        subscriptionStart: user.subscription.cycleStart,
        subscriptionEnd: user.subscription.cycleEnd,
        payment,
        reason,
      },
    ],
    { session },
  );
};

const reconcileSubscription = async (user, now, session) => {
  const subscription = user.subscription;
  const plan = getSubscriptionPlan(subscription?.plan);

  if (!plan) {
    throw new Error("INVALID_SUBSCRIPTION_PLAN");
  }

  if (!subscription.cycleStart || !subscription.cycleEnd) {
    setFreeSubscription(user, now, addBillingMonth(now));
    await user.save({ session });
    return;
  }

  if (new Date(subscription.cycleEnd) > now) {
    return;
  }

  const previousPlan = subscription.plan;

  if (previousPlan !== "free") {
    setFreeSubscription(user, now, addBillingMonth(now));

    await user.save({ session });

    await recordHistory({
      user,
      action: "expired",
      previousPlan,
      newPlan: "free",
      reason: "BILLING_CYCLE_ENDED",
      session,
    });

    return;
  }

  const nextEnd = getNextCycle(subscription.cycleStart, now);

  let nextStart = new Date(subscription.cycleStart);

  while (addBillingMonth(nextStart) <= now) {
    nextStart = addBillingMonth(nextStart);
  }

  subscription.cycleStart = nextStart;
  subscription.cycleEnd = nextEnd;
  subscription.applicationsUsed = 0;
  subscription.applicationLimit = 1;
  subscription.status = "active";
  subscription.cancelAtPeriodEnd = false;
  subscription.scheduledPlan = null;

  await user.save({ session });
};

const getCurrentSubscription = async (userId, now = new Date()) => {
  return mongoose.connection.transaction(async (session) => {
    const user = await User.findById(userId).session(session);

    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    await reconcileSubscription(user, now, session);

    const subscription = user.subscription;
    const limit = subscription.applicationLimit;

    return {
      plan: subscription.plan,
      status: subscription.status,
      applicationLimit: limit,
      applicationsUsed: subscription.applicationsUsed,
      remainingApplications:
        limit === null
          ? null
          : Math.max(0, limit - subscription.applicationsUsed),
      unlimited: limit === null,
      cycleStart: subscription.cycleStart,
      cycleEnd: subscription.cycleEnd,
      renewalDate: subscription.cycleEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    };
  });
};

const cancelSubscription = async (userId, now = new Date()) => {
  return mongoose.connection.transaction(async (session) => {
    const user = await User.findById(userId).session(session);

    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    await reconcileSubscription(user, now, session);

    const subscription = user.subscription;

    if (subscription.plan === "free") {
      throw new Error("FREE_PLAN_CANNOT_BE_CANCELLED");
    }

    if (subscription.cancelAtPeriodEnd) {
      return {
        alreadyCancelled: true,
        effectiveAt: subscription.cycleEnd,
      };
    }

    const previousPlan = subscription.plan;
    subscription.cancelAtPeriodEnd = true;

    await user.save({ session });

    await recordHistory({
      user,
      action: "cancelled",
      previousPlan,
      newPlan: previousPlan,
      reason: "USER_REQUESTED_CANCELLATION",
      session,
    });

    return {
      cancelled: true,
      effectiveAt: subscription.cycleEnd,
    };
  });
};

const activatePaidSubscription = async ({
  userId,
  paymentId,
  gatewayPayment,
  now = new Date(),
}) => {
  return mongoose.connection.transaction(async (session) => {
    const user = await User.findById(userId).session(session);

    if (!user) throw new Error("USER_NOT_FOUND");

    const payment = await SubscriptionPayment.findOne({
      _id: paymentId,
      user: user._id,
    }).session(session);

    if (!payment) throw new Error("PAYMENT_RECORD_NOT_FOUND");

    const plan = getSubscriptionPlan(payment.plan);

    if (
      !plan ||
      payment.plan === "free" ||
      payment.amount !== plan.price ||
      payment.currency !== "INR"
    ) {
      throw new Error("INVALID_SUBSCRIPTION_PAYMENT");
    }

    if (
      !gatewayPayment ||
      gatewayPayment.order_id !== payment.razorpayOrderId ||
      Number(gatewayPayment.amount) !== payment.amount ||
      gatewayPayment.currency !== payment.currency ||
      gatewayPayment.status !== "captured" ||
      gatewayPayment.captured !== true ||
      !gatewayPayment.id
    ) {
      throw new Error("VERIFIED_PAYMENT_REQUIRED");
    }

    const previousActivation = await SubscriptionHistory.findOne({
      payment: payment._id,
    }).session(session);

    if (previousActivation) {
      if (
        payment.razorpayPaymentId !== gatewayPayment.id ||
        payment.status !== "paid"
      ) {
        throw new Error("PAYMENT_ALREADY_PROCESSED");
      }

      return {
        alreadyActivated: true,
        paymentRecordId: payment._id,
        plan: payment.plan,
        cycleStart: payment.subscriptionStart,
        cycleEnd: payment.subscriptionEnd,
        invoiceNumber: payment.invoiceNumber,
      };
    }

    if (
      payment.status === "paid" &&
      payment.razorpayPaymentId !== gatewayPayment.id
    ) {
      throw new Error("PAYMENT_ALREADY_PROCESSED");
    }

    await reconcileSubscription(user, now, session);

    const previousPlan = user.subscription.plan;
    const previousPrice = getSubscriptionPlan(previousPlan).price;

    let action = "activated";

    if (payment.action === "renewal") {
      action = "renewed";
    } else if (plan.price > previousPrice && previousPlan !== "free") {
      action = "upgraded";
    } else if (plan.price < previousPrice) {
      action = "downgraded";
    }

    const cycleStart = now;
    const cycleEnd = addBillingMonth(now);
    const invoiceNumber = `SUB-${payment._id.toString().slice(-12).toUpperCase()}`;

    const updatedPayment = await SubscriptionPayment.updateOne(
      {
        _id: payment._id,
        status: { $in: ["created", "failed", "cancelled"] },
      },
      {
        $set: {
          status: "paid",
          razorpayPaymentId: gatewayPayment.id,
          paidAt: now,
          failedAt: null,
          cancelledAt: null,
          failureReason: "",
          invoiceNumber,
          subscriptionStart: cycleStart,
          subscriptionEnd: cycleEnd,
        },
      },
      { session },
    );

    if (updatedPayment.modifiedCount !== 1) {
      throw new Error("PAYMENT_ALREADY_PROCESSED");
    }

    user.subscription.plan = payment.plan;
    user.subscription.status = "active";
    user.subscription.applicationLimit = plan.applicationLimit;
    user.subscription.applicationsUsed = 0;
    user.subscription.cycleStart = cycleStart;
    user.subscription.cycleEnd = cycleEnd;
    user.subscription.cancelAtPeriodEnd = false;
    user.subscription.scheduledPlan = null;
    user.subscription.lastPayment = payment._id;

    await user.save({ session });

    await recordHistory({
      user,
      action,
      previousPlan,
      newPlan: payment.plan,
      payment: payment._id,
      session,
    });

    return {
      activated: true,
      paymentRecordId: payment._id,
      plan: payment.plan,
      cycleStart,
      cycleEnd,
      applicationLimit: plan.applicationLimit,
      invoiceNumber,
    };
  });
};

module.exports = {
  addBillingMonth,
  getCurrentSubscription,
  cancelSubscription,
  activatePaidSubscription,
};
