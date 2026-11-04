const express = require("express");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

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
  verifySubscriptionPayment,
  inspectSubscriptionPayment,
  closeSubscriptionOrder,
} = require("../services/subscriptionPaymentService");

const {
  generateSubscriptionInvoice,
} = require("../services/subscriptionInvoiceService");

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

const paymentErrorStatus = (code) => {
  if (["PAYMENT_RECORD_NOT_FOUND"].includes(code)) return 404;

  if (
    [
      "INVALID_PAYMENT_SIGNATURE",
      "PAYMENT_ORDER_MISMATCH",
      "PAYMENT_AMOUNT_MISMATCH",
      "PAYMENT_CURRENCY_MISMATCH",
    ].includes(code)
  )
    return 400;

  if (
    [
      "PAYMENT_NOT_CAPTURED",
      "PAYMENT_AWAITING_CAPTURE",
      "PAYMENT_ALREADY_PROCESSED",
      "VERIFIED_PAYMENT_REQUIRED",
      "PAYMENT_SUPERSEDED_BY_NEWER_PURCHASE",
    ].includes(code)
  )
    return 409;

  return 502;
};

const respondPaymentError = (res, error, operation) => {
  console.error(`${operation} failed:`, error);

  const code = error.message || "SUBSCRIPTION_PAYMENT_FAILED";
  const status = paymentErrorStatus(code);

  return res.status(status).json({
    error: status === 502 ? "SUBSCRIPTION_PAYMENT_PROCESSING_FAILED" : code,
  });
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
      const state = await inspectSubscriptionPayment({
        userId: user._id,
        paymentRecordId: existingPayment._id,
      });

      if (state.status === "paid") {
        return res.status(409).json({
          error: "PREVIOUS_PAYMENT_COMPLETED",
          paymentRecordId: existingPayment._id,
          subscription: state,
        });
      }

      if (state.status === "created") {
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

router.post("/verify-payment", async (req, res) => {
  try {
    const {
      paymentRecordId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body || {};

    if (
      !mongoose.isValidObjectId(paymentRecordId) ||
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string" ||
      !/^[-_a-zA-Z0-9]+$/.test(razorpay_order_id) ||
      !/^[-_a-zA-Z0-9]+$/.test(razorpay_payment_id) ||
      !/^[a-fA-F0-9]{64}$/.test(razorpay_signature)
    ) {
      return res.status(400).json({
        error: "INVALID_PAYMENT_DETAILS",
      });
    }

    const user = await User.findOne({
      firebaseUid: req.firebaseUser.uid,
    });

    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    const result = await verifySubscriptionPayment({
      userId: user._id,
      paymentRecordId,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });

    return res.status(200).json({
      message: result.alreadyActivated
        ? "PAYMENT_ALREADY_VERIFIED"
        : "SUBSCRIPTION_ACTIVATED",
      ...result,
    });
  } catch (error) {
    return respondPaymentError(res, error, "Subscription verification");
  }
});

router.post("/sync-payment", async (req, res) => {
  try {
    const { paymentRecordId } = req.body || {};

    if (!mongoose.isValidObjectId(paymentRecordId)) {
      return res.status(400).json({
        error: "INVALID_PAYMENT_RECORD_ID",
      });
    }

    const user = await User.findOne({
      firebaseUid: req.firebaseUser.uid,
    });

    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    const result = await inspectSubscriptionPayment({
      userId: user._id,
      paymentRecordId,
    });

    return res.status(200).json(result);
  } catch (error) {
    return respondPaymentError(res, error, "Subscription payment sync");
  }
});

router.post("/cancel-order", async (req, res) => {
  try {
    const { paymentRecordId } = req.body || {};

    if (!mongoose.isValidObjectId(paymentRecordId)) {
      return res.status(400).json({
        error: "INVALID_PAYMENT_RECORD_ID",
      });
    }

    const user = await User.findOne({
      firebaseUid: req.firebaseUser.uid,
    });

    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    const result = await closeSubscriptionOrder({
      userId: user._id,
      paymentRecordId,
    });

    return res.status(200).json(result);
  } catch (error) {
    return respondPaymentError(res, error, "Subscription order cancellation");
  }
});

router.get("/payments", async (req, res) => {
  try {
    const user = await User.findOne({
      firebaseUid: req.firebaseUser.uid,
    });

    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    const payments = await SubscriptionPayment.find({
      user: user._id,
    })
      .select(
        "plan action amount currency razorpayOrderId razorpayPaymentId " +
          "status paidAt failedAt cancelledAt failureReason " +
          "invoiceNumber subscriptionStart subscriptionEnd " +
          "confirmationEmailSentAt testMode createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ payments });
  } catch (error) {
    console.error("Subscription payment history failed:", error);

    return res.status(500).json({
      error: "SUBSCRIPTION_PAYMENT_HISTORY_FAILED",
    });
  }
});

router.get("/payments/:paymentRecordId/invoice", async (req, res) => {
  try {
    const { paymentRecordId } = req.params;

    if (!mongoose.isValidObjectId(paymentRecordId)) {
      return res.status(400).json({
        error: "INVALID_PAYMENT_RECORD_ID",
      });
    }

    const user = await User.findOne({
      firebaseUid: req.firebaseUser.uid,
    });

    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    const payment = await SubscriptionPayment.findOne({
      _id: paymentRecordId,
      user: user._id,
    }).lean();

    if (!payment) {
      return res.status(404).json({
        error: "PAYMENT_RECORD_NOT_FOUND",
      });
    }

    if (payment.status !== "paid" || !payment.invoiceNumber) {
      return res.status(409).json({
        error: "INVOICE_NOT_AVAILABLE",
      });
    }

    const invoice = await generateSubscriptionInvoice(payment);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${payment.invoiceNumber}.pdf"`,
      "Content-Length": invoice.length,
      "Cache-Control": "private, no-store",
    });

    return res.status(200).send(invoice);
  } catch (error) {
    console.error("Subscription invoice generation failed:", error);

    return res.status(500).json({
      error: "SUBSCRIPTION_INVOICE_GENERATION_FAILED",
    });
  }
});

module.exports = router;
