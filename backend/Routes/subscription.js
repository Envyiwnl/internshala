const express = require("express");
const crypto = require("node:crypto");

const User = require("../Model/User");
const SubscriptionPayment = require("../Model/SubscriptionPayment");

const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");
const verifyLoginSession = require("../middleware/verifyLoginSession");

const {
  SUBSCRIPTION_PLANS,
  getSubscriptionPlan,
} = require("../config/subscriptionPlans");

const { getCurrentSubscription } = require("../services/subscriptionService");

const {
  createSubscriptionPaymentOrder,
} = require("../services/razorpayService");

const {
  isWithinSubscriptionPaymentWindow,
  getSubscriptionPaymentWindow,
  formatSubscriptionOrder,
} = require("../utils/subscriptionPayment");

const router = express.Router();

router.get("/plans", (req, res) => {
  return res.status(200).json({
    currency: "INR",
    billingPeriod: "monthly",
    plans: SUBSCRIPTION_PLANS,
  });
});

router.use(verifyFirebaseToken, verifyLoginSession);

const normalizeBillingDetails = (details, user) => {
  const value = (input, fallback = "") =>
    typeof input === "string" ? input.trim().slice(0, 200) : fallback;

  return {
    name: value(details?.name, user.name || ""),
    email: user.email,
    address: value(details?.address),
    city: value(details?.city),
    state: value(details?.state),
    postalCode: value(details?.postalCode),
    country: value(details?.country, "India"),
  };
};

router.post("/create-order", async (req, res) => {
  try {
    const { plan: requestedPlan, billingDetails } = req.body || {};

    const plan = getSubscriptionPlan(requestedPlan);

    if (!plan || requestedPlan === "free") {
      return res.status(400).json({
        error: "INVALID_PAID_SUBSCRIPTION_PLAN",
      });
    }

    if (!isWithinSubscriptionPaymentWindow()) {
      return res.status(403).json({
        error: "SUBSCRIPTION_PAYMENT_OUTSIDE_ALLOWED_HOURS",
        message:
          "Subscription payments can only be initiated between 5:00 AM and 11:45 AM IST.",
        allowedWindow: getSubscriptionPaymentWindow(),
      });
    }

    if (
      !process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") ||
      !process.env.RAZORPAY_KEY_SECRET
    ) {
      return res.status(500).json({
        error: "RAZORPAY_TEST_MODE_REQUIRED",
      });
    }

    const user = await User.findOne({
      firebaseUid: req.firebaseUser.uid,
    });

    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
      });
    }

    const existingPayment = await SubscriptionPayment.findOne({
      user: user._id,
      status: "created",
    });

    if (existingPayment) {
      if (existingPayment.plan !== requestedPlan) {
        return res.status(409).json({
          error: "ANOTHER_SUBSCRIPTION_ORDER_PENDING",
          paymentRecordId: existingPayment._id,
        });
      }

      return res
        .status(200)
        .json(formatSubscriptionOrder(existingPayment, true));
    }

    const subscription = await getCurrentSubscription(user._id);
    const currentPlan = getSubscriptionPlan(subscription.plan);

    let action = "purchase";

    if (subscription.plan !== "free") {
      if (requestedPlan === subscription.plan) {
        action = "renewal";
      } else if (plan.price > currentPlan.price) {
        action = "upgrade";
      } else {
        action = "downgrade";
      }
    }

    const receipt = `sub_${crypto.randomBytes(12).toString("hex")}`;

    const order = await createSubscriptionPaymentOrder({
      amount: plan.price,
      receipt,
    });

    if (
      !order?.id ||
      Number(order.amount) !== plan.price ||
      order.currency !== "INR"
    ) {
      return res.status(502).json({
        error: "INVALID_RAZORPAY_ORDER",
      });
    }

    let payment;

    try {
      payment = await SubscriptionPayment.create({
        user: user._id,
        plan: requestedPlan,
        action,
        amount: plan.price,
        currency: "INR",
        razorpayOrderId: order.id,
        billingDetails: normalizeBillingDetails(billingDetails, user),
        testMode: true,
      });
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }

      const existing = await SubscriptionPayment.findOne({
        user: user._id,
        status: "created",
      });

      if (!existing) {
        throw error;
      }

      if (existing.plan !== requestedPlan) {
        return res.status(409).json({
          error: "ANOTHER_SUBSCRIPTION_ORDER_PENDING",
          paymentRecordId: existing._id,
        });
      }

      return res.status(200).json(formatSubscriptionOrder(existing, true));
    }

    return res.status(201).json(formatSubscriptionOrder(payment));
  } catch (error) {
    console.error("Subscription order creation failed:", error);

    return res.status(500).json({
      error: "SUBSCRIPTION_ORDER_CREATION_FAILED",
    });
  }
});

module.exports = router;
