const express = require("express");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

const ResumeOtp = require("../Model/ResumeOtp");
const User = require("../Model/User");
const verifyFirebaseToken = require("../middleware/verifyFirebaseToken");
const requirePremium = require("../middleware/requirePremium");
const { sendResumeOtp } = require("../services/resumeEmailService");
const { generateResumePdf } = require("../services/resumePdfService");

const {
  storeResumePdf,
  deleteResumePdf,
  openResumePdfDownloadStream,
} = require("../services/resumeStorageService");
const Resume = require("../Model/Resume");
const ResumePayment = require("../Model/ResumePayment");
const validateResume = require("../utils/validateResume");

const {
  createResumePaymentOrder,
  verifyRazorpayPaymentSignature,
  fetchRazorpayPayment,
  fetchRazorpayOrder,
  fetchRazorpayOrderPayments,
} = require("../services/razorpayService");

const router = express.Router();

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_VERIFICATION_WINDOW_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const RESUME_PRICE_PAISE = 5000;
const ACTIVE_ORDER_WINDOW_MS = 15 * 60 * 1000;
const GENERATION_STALE_MS = 10 * 60 * 1000;

const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_OTP_ATTEMPTS = 5;

const hashOtp = (userId, otp) => {
  return crypto
    .createHmac("sha256", process.env.OTP_HASH_SECRET)
    .update(`${userId}:resume-payment:${otp}`)
    .digest("hex");
};

router.get("/", verifyFirebaseToken, requirePremium, async (req, res) => {
  try {
    const user = req.dbUser;

    const resumes = await Resume.find({
      user: user._id,
    }).sort({
      updatedAt: -1,
    });

    return res.status(200).json({
      resumes,
    });
  } catch (error) {
    console.error("Resume list failed:", error);

    return res.status(500).json({
      error: "RESUME_LIST_FAILED",
    });
  }
});

router.post("/draft", verifyFirebaseToken, requirePremium, async (req, res) => {
  try {
    const user = req.dbUser;

    const { title, content, customization } = req.body;

    const resume = await Resume.create({
      user: user._id,
      title: title?.trim() || "My Resume",
      content: content || {},
      customization: customization || {},
      status: "draft",
    });

    await User.findByIdAndUpdate(user._id, {
      $addToSet: {
        resumes: resume._id,
      },
    });

    return res.status(201).json({
      message: "RESUME_DRAFT_CREATED",
      resume,
    });
  } catch (error) {
    console.error("Resume draft creation failed:", error);

    return res.status(500).json({
      error: "RESUME_DRAFT_CREATION_FAILED",
    });
  }
});

router.put(
  "/:resumeId",
  verifyFirebaseToken,
  requirePremium,
  async (req, res) => {
    try {
      const user = req.dbUser;

      const resume = await Resume.findOne({
        _id: req.params.resumeId,
        user: user._id,
      });

      if (!resume) {
        return res.status(404).json({
          error: "RESUME_NOT_FOUND",
        });
      }

      const { title, content, customization } = req.body;

      if (typeof title === "string") {
        resume.title = title.trim() || "My Resume";
      }

      if (content) {
        resume.content = content;
      }

      if (customization) {
        resume.customization = customization;
      }

      await resume.save();

      return res.status(200).json({
        message: "RESUME_DRAFT_UPDATED",
        resume,
      });
    } catch (error) {
      console.error("Resume update failed:", error);

      return res.status(500).json({
        error: "RESUME_UPDATE_FAILED",
      });
    }
  },
);

router.delete(
  "/:resumeId",
  verifyFirebaseToken,
  requirePremium,
  async (req, res) => {
    try {
      const user = req.dbUser;

      const resume = await Resume.findOne({
        _id: req.params.resumeId,
        user: user._id,
      });

      if (!resume) {
        return res.status(404).json({
          error: "RESUME_NOT_FOUND",
        });
      }

      if (resume.status === "generated" || resume.versions.length > 0) {
        return res.status(409).json({
          error: "GENERATED_RESUME_CANNOT_BE_DELETED",
        });
      }

      await Resume.deleteOne({
        _id: resume._id,
      });

      const userUpdate = {
        $pull: {
          resumes: resume._id,
        },
      };

      if (user.defaultResume?.equals(resume._id)) {
        userUpdate.$unset = {
          defaultResume: 1,
        };
      }

      await User.findByIdAndUpdate(user._id, userUpdate);

      return res.status(200).json({
        message: "RESUME_DRAFT_DELETED",
      });
    } catch (error) {
      console.error("Resume deletion failed:", error);

      return res.status(500).json({
        error: "RESUME_DELETE_FAILED",
      });
    }
  },
);

router.post(
  "/request-otp",
  verifyFirebaseToken,
  requirePremium,
  async (req, res) => {
    try {
      const user = req.dbUser;
      const { resumeId } = req.body;

      if (!resumeId) {
        return res.status(400).json({
          error: "RESUME_ID_REQUIRED",
        });
      }

      const resume = await Resume.findOne({
        _id: resumeId,
        user: user._id,
      });

      if (!resume) {
        return res.status(404).json({
          error: "RESUME_NOT_FOUND",
        });
      }

      const validation = validateResume(resume);

      if (!validation.isValid) {
        return res.status(400).json({
          error: "INCOMPLETE_RESUME",
          details: validation.errors,
        });
      }

      if (!user.email) {
        return res.status(400).json({
          error: "EMAIL_NOT_AVAILABLE",
        });
      }

      const now = new Date();

      const existingOtp = await ResumeOtp.findOne({
        user: user._id,
      });

      if (existingOtp?.lastSentAt) {
        const timeSinceLastRequest =
          now.getTime() - existingOtp.lastSentAt.getTime();

        if (timeSinceLastRequest < OTP_COOLDOWN_MS) {
          const retryAfter = Math.ceil(
            (OTP_COOLDOWN_MS - timeSinceLastRequest) / 1000,
          );

          return res.status(429).json({
            error: "OTP_RESEND_TOO_SOON",
            retryAfter,
          });
        }
      }

      let requestCount = 1;
      let requestWindowStartedAt = now;

      if (existingOtp?.requestWindowStartedAt) {
        const windowAge =
          now.getTime() - existingOtp.requestWindowStartedAt.getTime();

        if (windowAge < REQUEST_WINDOW_MS) {
          if (existingOtp.requestCount >= MAX_REQUESTS_PER_WINDOW) {
            return res.status(429).json({
              error: "OTP_REQUEST_LIMIT_REACHED",
            });
          }

          requestCount = existingOtp.requestCount + 1;

          requestWindowStartedAt = existingOtp.requestWindowStartedAt;
        }
      }

      const otp = crypto.randomInt(100000, 1000000).toString();

      const otpHash = hashOtp(user._id.toString(), otp);

      const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);

      await sendResumeOtp({
        email: user.email,
        otp,
        language: user.preferredLanguage,
      });

      await ResumeOtp.findOneAndUpdate(
        {
          user: user._id,
        },
        {
          $set: {
            resume: resume._id,

            purpose: "resume-payment",

            otpHash,

            expiresAt,

            attempts: 0,

            requestCount,

            requestWindowStartedAt,

            lastSentAt: now,

            verifiedAt: null,

            verifiedUntil: null,

            consumedAt: null,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );

      return res.status(200).json({
        message: "OTP_SENT",
        expiresIn: 600,
        resumeId: resume._id,
      });
    } catch (error) {
      console.error("Resume OTP request failed:", error);

      return res.status(500).json({
        error: "OTP_SEND_FAILED",
      });
    }
  },
);

router.post(
  "/verify-otp",
  verifyFirebaseToken,
  requirePremium,
  async (req, res) => {
    try {
      const user = req.dbUser;

      const { otp, resumeId } = req.body;

      if (!resumeId) {
        return res.status(400).json({
          error: "RESUME_ID_REQUIRED",
        });
      }

      if (!otp || !/^\d{6}$/.test(otp)) {
        return res.status(400).json({
          error: "INVALID_OTP_FORMAT",
        });
      }

      const otpRecord = await ResumeOtp.findOne({
        user: user._id,
      });

      if (!otpRecord) {
        return res.status(400).json({
          error: "OTP_NOT_FOUND",
        });
      }

      if (
        !otpRecord.resume ||
        otpRecord.resume.toString() !== resumeId.toString()
      ) {
        return res.status(403).json({
          error: "OTP_RESUME_MISMATCH",
        });
      }

      if (otpRecord.consumedAt) {
        return res.status(400).json({
          error: "OTP_ALREADY_USED",
        });
      }

      if (otpRecord.expiresAt.getTime() < Date.now()) {
        return res.status(400).json({
          error: "OTP_EXPIRED",
        });
      }

      if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
        return res.status(429).json({
          error: "OTP_TOO_MANY_ATTEMPTS",
        });
      }

      const submittedHash = hashOtp(user._id.toString(), otp);

      const storedBuffer = Buffer.from(otpRecord.otpHash, "hex");

      const submittedBuffer = Buffer.from(submittedHash, "hex");

      const isValid =
        storedBuffer.length === submittedBuffer.length &&
        crypto.timingSafeEqual(storedBuffer, submittedBuffer);

      if (!isValid) {
        otpRecord.attempts += 1;

        await otpRecord.save();

        const attemptsLeft = MAX_OTP_ATTEMPTS - otpRecord.attempts;

        if (attemptsLeft <= 0) {
          return res.status(429).json({
            error: "OTP_TOO_MANY_ATTEMPTS",
          });
        }

        return res.status(400).json({
          error: "INVALID_OTP",
          attemptsLeft,
        });
      }

      const verifiedAt = new Date();

      otpRecord.verifiedAt = verifiedAt;

      otpRecord.verifiedUntil = new Date(
        verifiedAt.getTime() + OTP_VERIFICATION_WINDOW_MS,
      );

      await otpRecord.save();

      return res.status(200).json({
        message: "OTP_VERIFIED",
        verifiedFor: 600,
      });
    } catch (error) {
      console.error("Resume OTP verification failed:", error);

      return res.status(500).json({
        error: "OTP_VERIFICATION_FAILED",
      });
    }
  },
);

router.post(
  "/create-order",
  verifyFirebaseToken,
  requirePremium,
  async (req, res) => {
    const user = req.dbUser;
    const { resumeId } = req.body;

    if (!resumeId) {
      return res.status(400).json({
        error: "RESUME_ID_REQUIRED",
      });
    }

    try {
      const resume = await Resume.findOne({
        _id: resumeId,
        user: user._id,
      });

      if (!resume) {
        return res.status(404).json({
          error: "RESUME_NOT_FOUND",
        });
      }

      const validation = validateResume(resume);

      if (!validation.isValid) {
        return res.status(400).json({
          error: "INCOMPLETE_RESUME",
          details: validation.errors,
        });
      }

      if (!process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_")) {
        return res.status(500).json({
          error: "RAZORPAY_TEST_MODE_REQUIRED",
        });
      }

      const existingPayment = await ResumePayment.findOne({
        user: user._id,
        resume: resume._id,
        status: "created",
      }).sort({
        createdAt: -1,
      });

      if (existingPayment) {
        const orderAge = Date.now() - existingPayment.createdAt.getTime();

        if (orderAge < ACTIVE_ORDER_WINDOW_MS) {
          return res.status(200).json({
            message: "ORDER_ALREADY_EXISTS",

            order: {
              id: existingPayment.razorpayOrderId,

              amount: existingPayment.amount,

              currency: existingPayment.currency,
            },

            paymentRecordId: existingPayment._id,

            keyId: process.env.RAZORPAY_KEY_ID,

            testMode: true,

            reused: true,
          });
        }

        const orderPayments = await fetchRazorpayOrderPayments(
          existingPayment.razorpayOrderId,
        );

        const paymentAttempts = Array.isArray(orderPayments?.items)
          ? orderPayments.items
          : [];

        const capturedPayment = paymentAttempts.find(
          (attempt) =>
            attempt.order_id === existingPayment.razorpayOrderId &&
            Number(attempt.amount) === RESUME_PRICE_PAISE &&
            attempt.currency === "INR" &&
            attempt.status === "captured" &&
            attempt.captured === true,
        );

        if (capturedPayment) {
          const duplicatePayment = await ResumePayment.findOne({
            _id: {
              $ne: existingPayment._id,
            },

            razorpayPaymentId: capturedPayment.id,

            status: "paid",
          });

          if (duplicatePayment) {
            return res.status(409).json({
              error: "DUPLICATE_PAYMENT",
            });
          }

          const paidAt = capturedPayment.captured_at
            ? new Date(capturedPayment.captured_at * 1000)
            : new Date();

          const invoiceNumber =
            existingPayment.invoiceNumber ||
            `INV-${paidAt.getTime()}-${capturedPayment.id
              .slice(-6)
              .toUpperCase()}`;

          const recoveredPayment = await ResumePayment.findOneAndUpdate(
            {
              _id: existingPayment._id,

              user: user._id,

              resume: resume._id,

              status: "created",
            },
            {
              $set: {
                razorpayPaymentId: capturedPayment.id,

                status: "paid",

                paidAt,

                failedAt: null,

                cancelledAt: null,

                invoiceNumber,

                failureReason: "",
              },
            },
            {
              new: true,
            },
          );

          if (!recoveredPayment) {
            const latestPayment = await ResumePayment.findById(
              existingPayment._id,
            );

            if (
              latestPayment?.status === "paid" &&
              latestPayment.razorpayPaymentId === capturedPayment.id
            ) {
              return res.status(200).json({
                message: "PAYMENT_ALREADY_VERIFIED",

                status: "paid",

                paymentRecordId: latestPayment._id,

                resumeId: latestPayment.resume,

                invoiceNumber: latestPayment.invoiceNumber,

                requiresGeneration: true,
              });
            }

            return res.status(409).json({
              error: "PAYMENT_ALREADY_PROCESSED",
            });
          }

          return res.status(200).json({
            message: "PAYMENT_RECOVERED",

            status: "paid",

            paymentRecordId: recoveredPayment._id,

            resumeId: recoveredPayment.resume,

            invoiceNumber: recoveredPayment.invoiceNumber,

            requiresGeneration: true,
          });
        }

        return res.status(200).json({
          message: "ORDER_ALREADY_EXISTS",

          order: {
            id: existingPayment.razorpayOrderId,

            amount: existingPayment.amount,

            currency: existingPayment.currency,
          },

          paymentRecordId: existingPayment._id,

          keyId: process.env.RAZORPAY_KEY_ID,

          testMode: true,

          reused: true,
        });
      }

      const otpRecord = await ResumeOtp.findOne({
        user: user._id,
      });

      if (!otpRecord) {
        return res.status(403).json({
          error: "OTP_VERIFICATION_REQUIRED",
        });
      }

      if (
        !otpRecord.resume ||
        otpRecord.resume.toString() !== resume._id.toString()
      ) {
        return res.status(403).json({
          error: "OTP_RESUME_MISMATCH",
        });
      }

      if (!otpRecord.verifiedAt) {
        return res.status(403).json({
          error: "OTP_VERIFICATION_REQUIRED",
        });
      }

      if (
        !otpRecord.verifiedUntil ||
        otpRecord.verifiedUntil.getTime() < Date.now()
      ) {
        return res.status(403).json({
          error: "OTP_VERIFICATION_EXPIRED",
        });
      }

      if (otpRecord.consumedAt) {
        return res.status(409).json({
          error: "OTP_ALREADY_USED",
        });
      }

      const consumedAt = new Date();

      const reservedOtp = await ResumeOtp.findOneAndUpdate(
        {
          _id: otpRecord._id,

          resume: resume._id,

          consumedAt: null,

          verifiedAt: {
            $ne: null,
          },

          verifiedUntil: {
            $gt: consumedAt,
          },
        },
        {
          $set: {
            consumedAt,
          },
        },
        {
          new: true,
        },
      );

      if (!reservedOtp) {
        return res.status(409).json({
          error: "OTP_ALREADY_USED_OR_EXPIRED",
        });
      }

      try {
        const receipt = `resume_${user._id.toString().slice(-8)}_${Date.now()}`;

        const razorpayOrder = await createResumePaymentOrder({
          amount: RESUME_PRICE_PAISE,

          receipt,
        });

        const payment = await ResumePayment.create({
          user: user._id,

          resume: resume._id,

          amount: RESUME_PRICE_PAISE,

          currency: "INR",

          razorpayOrderId: razorpayOrder.id,

          status: "created",

          otpVerified: true,

          otpVerifiedAt: reservedOtp.verifiedAt,

          testMode: true,
        });

        return res.status(201).json({
          message: "ORDER_CREATED",

          order: {
            id: razorpayOrder.id,

            amount: razorpayOrder.amount,

            currency: razorpayOrder.currency,
          },

          paymentRecordId: payment._id,

          keyId: process.env.RAZORPAY_KEY_ID,

          testMode: true,

          reused: false,
        });
      } catch (paymentError) {
        await ResumeOtp.updateOne(
          {
            _id: reservedOtp._id,
            consumedAt,
          },
          {
            $set: {
              consumedAt: null,
            },
          },
        );

        throw paymentError;
      }
    } catch (error) {
      console.error("Resume order creation failed:", error);

      return res.status(500).json({
        error: "ORDER_CREATION_FAILED",
      });
    }
  },
);

router.post(
  "/verify-payment",
  verifyFirebaseToken,
  requirePremium,
  async (req, res) => {
    try {
      const user = req.dbUser;

      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
        req.body;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({
          error: "PAYMENT_DETAILS_REQUIRED",
        });
      }

      const paymentRecord = await ResumePayment.findOne({
        user: user._id,
        razorpayOrderId: razorpay_order_id,
      });

      if (!paymentRecord) {
        return res.status(404).json({
          error: "PAYMENT_RECORD_NOT_FOUND",
        });
      }

      if (paymentRecord.status === "paid") {
        if (paymentRecord.razorpayPaymentId === razorpay_payment_id) {
          return res.status(200).json({
            message: "PAYMENT_ALREADY_VERIFIED",

            paymentRecordId: paymentRecord._id,

            invoiceNumber: paymentRecord.invoiceNumber,

            resumeId: paymentRecord.resume,
          });
        }

        return res.status(409).json({
          error: "PAYMENT_ALREADY_COMPLETED",
        });
      }

      if (!["created", "failed", "cancelled"].includes(paymentRecord.status)) {
        return res.status(409).json({
          error: "PAYMENT_NOT_ACTIVE",
        });
      }

      const signatureIsValid = verifyRazorpayPaymentSignature({
        razorpayOrderId: paymentRecord.razorpayOrderId,

        razorpayPaymentId: razorpay_payment_id,

        razorpaySignature: razorpay_signature,
      });

      if (!signatureIsValid) {
        return res.status(400).json({
          error: "INVALID_PAYMENT_SIGNATURE",
        });
      }

      const razorpayPayment = await fetchRazorpayPayment(razorpay_payment_id);

      if (razorpayPayment.order_id !== paymentRecord.razorpayOrderId) {
        return res.status(400).json({
          error: "PAYMENT_ORDER_MISMATCH",
        });
      }

      if (Number(razorpayPayment.amount) !== RESUME_PRICE_PAISE) {
        return res.status(400).json({
          error: "PAYMENT_AMOUNT_MISMATCH",
        });
      }

      if (razorpayPayment.currency !== "INR") {
        return res.status(400).json({
          error: "PAYMENT_CURRENCY_MISMATCH",
        });
      }

      if (
        razorpayPayment.status !== "captured" ||
        razorpayPayment.captured !== true
      ) {
        return res.status(409).json({
          error: "PAYMENT_NOT_CAPTURED",
          paymentStatus: razorpayPayment.status,
        });
      }

      const duplicatePayment = await ResumePayment.findOne({
        _id: {
          $ne: paymentRecord._id,
        },

        razorpayPaymentId: razorpay_payment_id,

        status: "paid",
      });

      if (duplicatePayment) {
        return res.status(409).json({
          error: "DUPLICATE_PAYMENT",
        });
      }

      const paidAt = new Date();

      const invoiceNumber = `INV-${paidAt.getTime()}-${razorpay_payment_id
        .slice(-6)
        .toUpperCase()}`;

      const updatedPayment = await ResumePayment.findOneAndUpdate(
        {
          _id: paymentRecord._id,

          status: {
            $in: ["created", "failed", "cancelled"],
          },
        },
        {
          $set: {
            razorpayPaymentId: razorpay_payment_id,

            razorpaySignature: razorpay_signature,

            status: "paid",

            paidAt,

            failedAt: null,
            cancelledAt: null,

            invoiceNumber,

            failureReason: "",
          },
        },
        {
          new: true,
        },
      );

      if (!updatedPayment) {
        const latestPayment = await ResumePayment.findById(paymentRecord._id);

        if (
          latestPayment?.status === "paid" &&
          latestPayment.razorpayPaymentId === razorpay_payment_id
        ) {
          return res.status(200).json({
            message: "PAYMENT_ALREADY_VERIFIED",

            paymentRecordId: latestPayment._id,

            invoiceNumber: latestPayment.invoiceNumber,

            resumeId: latestPayment.resume,
          });
        }

        return res.status(409).json({
          error: "PAYMENT_ALREADY_PROCESSED",
        });
      }

      return res.status(200).json({
        message: "PAYMENT_VERIFIED",

        paymentRecordId: updatedPayment._id,

        resumeId: updatedPayment.resume,

        amount: updatedPayment.amount,

        currency: updatedPayment.currency,

        invoiceNumber: updatedPayment.invoiceNumber,

        paidAt: updatedPayment.paidAt,

        testMode: updatedPayment.testMode,
      });
    } catch (error) {
      console.error("Resume payment verification failed:", error);

      return res.status(500).json({
        error: "PAYMENT_VERIFICATION_FAILED",
      });
    }
  },
);

router.post(
  "/generate",
  verifyFirebaseToken,
  requirePremium,
  async (req, res) => {
    const user = req.dbUser;

    const { resumeId, paymentRecordId } = req.body;

    if (!resumeId) {
      return res.status(400).json({
        error: "RESUME_ID_REQUIRED",
      });
    }

    if (!paymentRecordId) {
      return res.status(400).json({
        error: "PAYMENT_RECORD_ID_REQUIRED",
      });
    }

    let claimedPayment = null;
    let storedFileId = null;

    try {
      const resume = await Resume.findOne({
        _id: resumeId,
        user: user._id,
      });

      if (!resume) {
        return res.status(404).json({
          error: "RESUME_NOT_FOUND",
        });
      }

      const validation = validateResume(resume);

      if (!validation.isValid) {
        return res.status(400).json({
          error: "INCOMPLETE_RESUME",
          details: validation.errors,
        });
      }

      const payment = await ResumePayment.findOne({
        _id: paymentRecordId,
        user: user._id,
        resume: resume._id,
      });

      if (!payment) {
        return res.status(404).json({
          error: "PAYMENT_RECORD_NOT_FOUND",
        });
      }

      if (payment.status !== "paid") {
        return res.status(403).json({
          error: "PAYMENT_REQUIRED",
        });
      }

      if (payment.amount !== RESUME_PRICE_PAISE || payment.currency !== "INR") {
        return res.status(400).json({
          error: "INVALID_PAYMENT_RECORD",
        });
      }

      if (payment.testMode !== true) {
        return res.status(400).json({
          error: "RAZORPAY_TEST_MODE_REQUIRED",
        });
      }

      if (!payment.razorpayPaymentId) {
        return res.status(400).json({
          error: "PAYMENT_NOT_VERIFIED",
        });
      }

      if (payment.generationStatus === "generated") {
        const existingVersion = resume.versions.find(
          (version) => version.versionNumber === payment.versionNumber,
        );

        return res.status(200).json({
          message: "RESUME_ALREADY_GENERATED",

          resumeId: resume._id,

          versionNumber: payment.versionNumber,

          pdfUrl: existingVersion?.pdfUrl || "",

          invoiceNumber: payment.invoiceNumber,
        });
      }

      const generationClaimedAt = new Date();

      const staleGenerationBefore = new Date(
        generationClaimedAt.getTime() - GENERATION_STALE_MS,
      );

      if (payment.generationStatus === "generating") {
        const activeGenerationStartedAt =
          payment.generationStartedAt || payment.updatedAt;

        if (
          activeGenerationStartedAt &&
          activeGenerationStartedAt > staleGenerationBefore
        ) {
          return res.status(409).json({
            error: "RESUME_GENERATION_IN_PROGRESS",
          });
        }
      }

      claimedPayment = await ResumePayment.findOneAndUpdate(
        {
          _id: payment._id,

          user: user._id,

          resume: resume._id,

          status: "paid",

          versionNumber: null,

          $or: [
            {
              generationStatus: {
                $in: ["pending", "failed"],
              },
            },
            {
              generationStatus: "generating",

              generationStartedAt: {
                $lte: staleGenerationBefore,
              },
            },
            {
              generationStatus: "generating",

              generationStartedAt: null,

              updatedAt: {
                $lte: staleGenerationBefore,
              },
            },
          ],
        },
        {
          $set: {
            generationStatus: "generating",

            generationStartedAt: generationClaimedAt,
          },
        },
        {
          new: true,
        },
      );

      if (!claimedPayment) {
        const latestPayment = await ResumePayment.findById(payment._id);

        if (latestPayment?.generationStatus === "generated") {
          const existingVersion = resume.versions.find(
            (version) => version.versionNumber === latestPayment.versionNumber,
          );

          return res.status(200).json({
            message: "RESUME_ALREADY_GENERATED",

            resumeId: resume._id,

            versionNumber: latestPayment.versionNumber,

            pdfUrl: existingVersion?.pdfUrl || "",

            invoiceNumber: latestPayment.invoiceNumber,
          });
        }

        if (latestPayment?.generationStatus === "generating") {
          return res.status(409).json({
            error: "RESUME_GENERATION_IN_PROGRESS",
          });
        }

        return res.status(409).json({
          error: "RESUME_GENERATION_ALREADY_CLAIMED",
        });
      }

      const contentSnapshot = resume.content?.toObject
        ? resume.content.toObject()
        : resume.content;

      const customizationSnapshot = resume.customization?.toObject
        ? resume.customization.toObject()
        : resume.customization;

      const pdfBuffer = await generateResumePdf({
        content: contentSnapshot,
        customization: customizationSnapshot,
      });

      if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
        throw new Error("PDF_GENERATION_RETURNED_EMPTY_BUFFER");
      }

      const nextVersion = resume.currentVersion + 1;

      const filename = `resume_${resume._id}_v${nextVersion}.pdf`;

      const storedPdf = await storeResumePdf({
        buffer: pdfBuffer,

        filename,

        metadata: {
          userId: user._id.toString(),

          resumeId: resume._id.toString(),

          paymentId: claimedPayment._id.toString(),

          versionNumber: nextVersion,
        },
      });

      storedFileId = storedPdf.fileId;

      const pdfUrl = `/api/resume/${resume._id}/version/${nextVersion}/download`;

      const session = await mongoose.startSession();

      let updatedResume;

      try {
        await session.withTransaction(async () => {
          await Resume.updateMany(
            {
              user: user._id,

              _id: {
                $ne: resume._id,
              },

              isDefault: true,
            },
            {
              $set: {
                isDefault: false,
              },
            },
            {
              session,
            },
          );

          updatedResume = await Resume.findOneAndUpdate(
            {
              _id: resume._id,

              user: user._id,

              currentVersion: resume.currentVersion,
            },
            {
              $set: {
                currentVersion: nextVersion,

                status: "generated",

                isDefault: true,
              },

              $push: {
                versions: {
                  versionNumber: nextVersion,

                  content: contentSnapshot,

                  customization: customizationSnapshot,

                  pdfUrl,

                  pdfFileId: storedPdf.fileId,

                  payment: claimedPayment._id,

                  generatedAt: new Date(),
                },
              },
            },
            {
              new: true,
              session,
            },
          );

          if (!updatedResume) {
            throw new Error("RESUME_VERSION_CONFLICT");
          }

          const userResult = await User.findOneAndUpdate(
            {
              _id: user._id,
            },
            {
              $addToSet: {
                resumes: resume._id,
              },

              $set: {
                defaultResume: resume._id,
              },
            },
            {
              new: true,
              session,
            },
          );

          if (!userResult) {
            throw new Error("USER_DEFAULT_RESUME_UPDATE_FAILED");
          }

          const paymentResult = await ResumePayment.findOneAndUpdate(
            {
              _id: claimedPayment._id,

              generationStatus: "generating",

              generationStartedAt: claimedPayment.generationStartedAt,

              versionNumber: null,
            },
            {
              $set: {
                generationStatus: "generated",

                generationStartedAt: null,

                versionNumber: nextVersion,
              },
            },
            {
              new: true,
              session,
            },
          );

          if (!paymentResult) {
            throw new Error("PAYMENT_GENERATION_UPDATE_FAILED");
          }
        });
      } finally {
        await session.endSession();
      }

      return res.status(201).json({
        message: "RESUME_GENERATED",

        resumeId: updatedResume._id,

        versionNumber: nextVersion,

        pdfUrl,

        invoiceNumber: claimedPayment.invoiceNumber,

        isDefault: true,
      });
    } catch (error) {
      console.error("Resume generation failed:", error);

      if (storedFileId) {
        try {
          await deleteResumePdf(storedFileId);
        } catch (cleanupError) {
          console.error("Generated PDF cleanup failed:", cleanupError);
        }
      }

      if (claimedPayment) {
        try {
          await ResumePayment.updateOne(
            {
              _id: claimedPayment._id,

              generationStatus: "generating",

              generationStartedAt: claimedPayment.generationStartedAt,
            },
            {
              $set: {
                generationStatus: "failed",

                generationStartedAt: null,
              },
            },
          );
        } catch (paymentCleanupError) {
          console.error(
            "Payment generation status cleanup failed:",
            paymentCleanupError,
          );
        }
      }

      if (error.message === "RESUME_VERSION_CONFLICT") {
        return res.status(409).json({
          error: "RESUME_VERSION_CONFLICT_RETRY",
        });
      }

      return res.status(500).json({
        error: "RESUME_GENERATION_FAILED",
      });
    }
  },
);

router.get(
  "/:resumeId/version/:versionNumber/download",
  verifyFirebaseToken,
  requirePremium,
  async (req, res) => {
    try {
      const user = req.dbUser;

      const { resumeId, versionNumber } = req.params;

      const parsedVersionNumber = Number(versionNumber);

      if (!Number.isInteger(parsedVersionNumber) || parsedVersionNumber < 1) {
        return res.status(400).json({
          error: "INVALID_VERSION_NUMBER",
        });
      }

      const resume = await Resume.findOne({
        _id: resumeId,
        user: user._id,
      });

      if (!resume) {
        return res.status(404).json({
          error: "RESUME_NOT_FOUND",
        });
      }

      const version = resume.versions.find(
        (item) => item.versionNumber === parsedVersionNumber,
      );

      if (!version) {
        return res.status(404).json({
          error: "RESUME_VERSION_NOT_FOUND",
        });
      }

      if (!version.pdfFileId) {
        return res.status(404).json({
          error: "RESUME_PDF_NOT_FOUND",
        });
      }

      let downloadStream;

      try {
        downloadStream = openResumePdfDownloadStream(version.pdfFileId);
      } catch (error) {
        console.error("Resume PDF stream creation failed:", error);

        return res.status(500).json({
          error: "RESUME_PDF_DOWNLOAD_FAILED",
        });
      }

      const filename = `resume-v${parsedVersionNumber}.pdf`;

      res.setHeader("Content-Type", "application/pdf");

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );

      res.setHeader("Cache-Control", "private, no-store");

      let streamFailed = false;

      downloadStream.on("error", (error) => {
        streamFailed = true;

        console.error("Resume PDF streaming failed:", error);

        if (!res.headersSent) {
          return res.status(404).json({
            error: "RESUME_PDF_NOT_FOUND",
          });
        }

        res.destroy(error);
      });

      res.on("finish", async () => {
        if (streamFailed) {
          return;
        }

        try {
          await Resume.updateOne(
            {
              _id: resume._id,
              user: user._id,
            },
            {
              $push: {
                downloadHistory: {
                  versionNumber: parsedVersionNumber,

                  downloadedAt: new Date(),

                  ipAddress: req.ip || "",

                  userAgent: req.get("user-agent") || "",
                },
              },
            },
          );
        } catch (historyError) {
          console.error(
            "Resume download history logging failed:",
            historyError,
          );
        }
      });

      downloadStream.pipe(res);
    } catch (error) {
      console.error("Resume download failed:", error);

      if (res.headersSent) {
        return res.end();
      }

      return res.status(500).json({
        error: "RESUME_PDF_DOWNLOAD_FAILED",
      });
    }
  },
);

router.put(
  "/:resumeId/default",
  verifyFirebaseToken,
  requirePremium,
  async (req, res) => {
    const user = req.dbUser;
    let session = null;

    try {
      const resume = await Resume.findOne({
        _id: req.params.resumeId,
        user: user._id,
      });

      if (!resume) {
        return res.status(404).json({
          error: "RESUME_NOT_FOUND",
        });
      }

      if (resume.status !== "generated" || resume.versions.length === 0) {
        return res.status(409).json({
          error: "RESUME_NOT_GENERATED",
        });
      }

      if (resume.isDefault) {
        if (
          !user.defaultResume ||
          user.defaultResume.toString() !== resume._id.toString()
        ) {
          await User.findByIdAndUpdate(user._id, {
            $set: {
              defaultResume: resume._id,
            },
            $addToSet: {
              resumes: resume._id,
            },
          });
        }

        return res.status(200).json({
          message: "DEFAULT_RESUME_ALREADY_SET",
          resumeId: resume._id,
          isDefault: true,
        });
      }

      session = await mongoose.startSession();

      await session.withTransaction(async () => {
        await Resume.updateMany(
          {
            user: user._id,
            isDefault: true,
            _id: {
              $ne: resume._id,
            },
          },
          {
            $set: {
              isDefault: false,
            },
          },
          {
            session,
          },
        );

        const updatedResume = await Resume.findOneAndUpdate(
          {
            _id: resume._id,
            user: user._id,
            status: "generated",
            "versions.0": {
              $exists: true,
            },
          },
          {
            $set: {
              isDefault: true,
            },
          },
          {
            new: true,
            session,
          },
        );

        if (!updatedResume) {
          throw new Error("DEFAULT_RESUME_UPDATE_FAILED");
        }

        const updatedUser = await User.findByIdAndUpdate(
          user._id,
          {
            $set: {
              defaultResume: resume._id,
            },
            $addToSet: {
              resumes: resume._id,
            },
          },
          {
            new: true,
            session,
          },
        );

        if (!updatedUser) {
          throw new Error("USER_DEFAULT_RESUME_UPDATE_FAILED");
        }
      });

      return res.status(200).json({
        message: "DEFAULT_RESUME_UPDATED",
        resumeId: resume._id,
        isDefault: true,
      });
    } catch (error) {
      console.error("Default resume update failed:", error);

      return res.status(500).json({
        error: "DEFAULT_RESUME_UPDATE_FAILED",
      });
    } finally {
      if (session) {
        await session.endSession();
      }
    }
  },
);

router.get(
  "/history",
  verifyFirebaseToken,
  requirePremium,
  async (req, res) => {
    try {
      const user = req.dbUser;

      const resumes = await Resume.find({
        user: user._id,
        "versions.0": {
          $exists: true,
        },
      })
        .select(
          "title status isDefault currentVersion versions downloadHistory createdAt updatedAt",
        )
        .sort({
          updatedAt: -1,
        })
        .lean();

      return res.status(200).json({
        resumes,
      });
    } catch (error) {
      console.error("Resume history fetch failed:", error);

      return res.status(500).json({
        error: "RESUME_HISTORY_FETCH_FAILED",
      });
    }
  },
);

router.get(
  "/payments",
  verifyFirebaseToken,
  requirePremium,
  async (req, res) => {
    try {
      const user = req.dbUser;

      const payments = await ResumePayment.find({
        user: user._id,
      })
        .select(
          "resume amount currency razorpayOrderId razorpayPaymentId status otpVerified otpVerifiedAt versionNumber generationStatus invoiceNumber paidAt failedAt cancelledAt failureReason testMode createdAt updatedAt",
        )
        .populate("resume", "title")
        .sort({
          createdAt: -1,
        })
        .lean();

      return res.status(200).json({
        payments,
      });
    } catch (error) {
      console.error("Resume payment history fetch failed:", error);

      return res.status(500).json({
        error: "PAYMENT_HISTORY_FETCH_FAILED",
      });
    }
  },
);

router.get(
  "/payments/:paymentRecordId/invoice",
  verifyFirebaseToken,
  requirePremium,
  async (req, res) => {
    try {
      const user = req.dbUser;

      const payment = await ResumePayment.findOne({
        _id: req.params.paymentRecordId,
        user: user._id,
      })
        .populate("resume", "title content.fullName")
        .lean();

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

      return res.status(200).json({
        invoice: {
          invoiceNumber: payment.invoiceNumber,

          paymentRecordId: payment._id,

          razorpayOrderId: payment.razorpayOrderId,

          razorpayPaymentId: payment.razorpayPaymentId,

          resumeId: payment.resume?._id || null,

          resumeTitle: payment.resume?.title || "Resume",

          customerName: payment.resume?.content?.fullName || "",

          customerEmail: user.email || "",

          amount: payment.amount,

          amountInRupees: payment.amount / 100,

          currency: payment.currency,

          versionNumber: payment.versionNumber,

          paidAt: payment.paidAt,

          generationStatus: payment.generationStatus,

          testMode: payment.testMode,
        },
      });
    } catch (error) {
      console.error("Resume invoice fetch failed:", error);

      return res.status(500).json({
        error: "INVOICE_FETCH_FAILED",
      });
    }
  },
);

router.post(
  "/payments/:paymentRecordId/sync",
  verifyFirebaseToken,
  requirePremium,
  async (req, res) => {
    try {
      const user = req.dbUser;

      const paymentRecord = await ResumePayment.findOne({
        _id: req.params.paymentRecordId,

        user: user._id,
      });

      if (!paymentRecord) {
        return res.status(404).json({
          error: "PAYMENT_RECORD_NOT_FOUND",
        });
      }

      if (
        paymentRecord.amount !== RESUME_PRICE_PAISE ||
        paymentRecord.currency !== "INR" ||
        paymentRecord.testMode !== true
      ) {
        return res.status(400).json({
          error: "INVALID_PAYMENT_RECORD",
        });
      }

      if (paymentRecord.status === "paid") {
        return res.status(200).json({
          message: "PAYMENT_ALREADY_VERIFIED",

          status: "paid",

          paymentRecordId: paymentRecord._id,

          razorpayPaymentId: paymentRecord.razorpayPaymentId,

          invoiceNumber: paymentRecord.invoiceNumber,

          resumeId: paymentRecord.resume,
        });
      }

      const razorpayOrder = await fetchRazorpayOrder(
        paymentRecord.razorpayOrderId,
      );

      const orderPayments = await fetchRazorpayOrderPayments(
        paymentRecord.razorpayOrderId,
      );

      const paymentAttempts = Array.isArray(orderPayments?.items)
        ? orderPayments.items
        : [];

      const capturedPayment = paymentAttempts.find(
        (attempt) =>
          attempt.order_id === paymentRecord.razorpayOrderId &&
          Number(attempt.amount) === RESUME_PRICE_PAISE &&
          attempt.currency === "INR" &&
          attempt.status === "captured" &&
          attempt.captured === true,
      );

      if (capturedPayment) {
        const duplicatePayment = await ResumePayment.findOne({
          _id: {
            $ne: paymentRecord._id,
          },

          razorpayPaymentId: capturedPayment.id,

          status: "paid",
        });

        if (duplicatePayment) {
          return res.status(409).json({
            error: "DUPLICATE_PAYMENT",
          });
        }

        const paidAt = capturedPayment.captured_at
          ? new Date(capturedPayment.captured_at * 1000)
          : new Date();

        const invoiceNumber =
          paymentRecord.invoiceNumber ||
          `INV-${paidAt.getTime()}-${capturedPayment.id
            .slice(-6)
            .toUpperCase()}`;

        const updatedPayment = await ResumePayment.findOneAndUpdate(
          {
            _id: paymentRecord._id,

            user: user._id,

            status: {
              $ne: "paid",
            },
          },
          {
            $set: {
              razorpayPaymentId: capturedPayment.id,

              status: "paid",

              paidAt,

              failedAt: null,

              cancelledAt: null,

              invoiceNumber,

              failureReason: "",
            },
          },
          {
            new: true,
          },
        );

        if (!updatedPayment) {
          const latestPayment = await ResumePayment.findById(paymentRecord._id);

          if (
            latestPayment?.status === "paid" &&
            latestPayment.razorpayPaymentId === capturedPayment.id
          ) {
            return res.status(200).json({
              message: "PAYMENT_ALREADY_VERIFIED",

              status: "paid",

              paymentRecordId: latestPayment._id,

              razorpayPaymentId: latestPayment.razorpayPaymentId,

              invoiceNumber: latestPayment.invoiceNumber,

              resumeId: latestPayment.resume,
            });
          }

          return res.status(409).json({
            error: "PAYMENT_ALREADY_PROCESSED",
          });
        }

        return res.status(200).json({
          message: "PAYMENT_RECOVERED",

          status: "paid",

          paymentRecordId: updatedPayment._id,

          razorpayPaymentId: updatedPayment.razorpayPaymentId,

          invoiceNumber: updatedPayment.invoiceNumber,

          resumeId: updatedPayment.resume,
        });
      }

      const failedPayment = [...paymentAttempts]
        .filter((attempt) => attempt.status === "failed")
        .sort(
          (a, b) => Number(b.created_at || 0) - Number(a.created_at || 0),
        )[0];

      if (failedPayment && razorpayOrder.status !== "paid") {
        const failureReason =
          failedPayment.error_description ||
          failedPayment.error_reason ||
          failedPayment.error_code ||
          "PAYMENT_ATTEMPT_FAILED";

        const failedAt = failedPayment.created_at
          ? new Date(failedPayment.created_at * 1000)
          : new Date();

        const updatedPayment = await ResumePayment.findOneAndUpdate(
          {
            _id: paymentRecord._id,

            user: user._id,

            status: {
              $in: ["created", "failed", "cancelled"],
            },
          },
          {
            $set: {
              status: "failed",

              failedAt,

              failureReason,
            },
          },
          {
            new: true,
          },
        );

        return res.status(200).json({
          message: "PAYMENT_FAILED",

          status: "failed",

          paymentRecordId: paymentRecord._id,

          failureReason: updatedPayment?.failureReason || failureReason,

          razorpayOrderStatus: razorpayOrder.status,
        });
      }

      return res.status(200).json({
        message: "PAYMENT_STATUS_PENDING",

        status: paymentRecord.status,

        paymentRecordId: paymentRecord._id,

        razorpayOrderStatus: razorpayOrder.status,

        canRetry: paymentRecord.status === "created",
      });
    } catch (error) {
      console.error("Resume payment sync failed:", error);

      return res.status(500).json({
        error: "PAYMENT_STATUS_SYNC_FAILED",
      });
    }
  },
);

router.post(
  "/payments/:paymentRecordId/cancel",
  verifyFirebaseToken,
  requirePremium,
  async (req, res) => {
    try {
      const user = req.dbUser;

      const paymentRecord = await ResumePayment.findOne({
        _id: req.params.paymentRecordId,
        user: user._id,
      });

      if (!paymentRecord) {
        return res.status(404).json({
          error: "PAYMENT_RECORD_NOT_FOUND",
        });
      }

      if (paymentRecord.status === "paid") {
        return res.status(409).json({
          error: "PAID_PAYMENT_CANNOT_BE_CANCELLED",
        });
      }

      if (paymentRecord.status === "cancelled") {
        return res.status(200).json({
          message: "PAYMENT_ALREADY_CANCELLED",

          paymentRecordId: paymentRecord._id,

          status: "cancelled",
        });
      }

      const orderPayments = await fetchRazorpayOrderPayments(
        paymentRecord.razorpayOrderId,
      );

      const paymentAttempts = Array.isArray(orderPayments?.items)
        ? orderPayments.items
        : [];

      const capturedPayment = paymentAttempts.find(
        (attempt) =>
          attempt.order_id === paymentRecord.razorpayOrderId &&
          Number(attempt.amount) === RESUME_PRICE_PAISE &&
          attempt.currency === "INR" &&
          attempt.status === "captured" &&
          attempt.captured === true,
      );

      if (capturedPayment) {
        const duplicatePayment = await ResumePayment.findOne({
          _id: {
            $ne: paymentRecord._id,
          },

          razorpayPaymentId: capturedPayment.id,

          status: "paid",
        });

        if (duplicatePayment) {
          return res.status(409).json({
            error: "DUPLICATE_PAYMENT",
          });
        }

        const paidAt = capturedPayment.captured_at
          ? new Date(capturedPayment.captured_at * 1000)
          : new Date();

        const invoiceNumber =
          paymentRecord.invoiceNumber ||
          `INV-${paidAt.getTime()}-${capturedPayment.id
            .slice(-6)
            .toUpperCase()}`;

        const recoveredPayment = await ResumePayment.findOneAndUpdate(
          {
            _id: paymentRecord._id,
            user: user._id,
            status: {
              $ne: "paid",
            },
          },
          {
            $set: {
              razorpayPaymentId: capturedPayment.id,

              status: "paid",

              paidAt,

              failedAt: null,

              cancelledAt: null,

              invoiceNumber,

              failureReason: "",
            },
          },
          {
            new: true,
          },
        );

        if (!recoveredPayment) {
          const latestPayment = await ResumePayment.findById(paymentRecord._id);

          if (
            latestPayment?.status === "paid" &&
            latestPayment.razorpayPaymentId === capturedPayment.id
          ) {
            return res.status(200).json({
              message: "PAYMENT_ALREADY_VERIFIED",

              status: "paid",

              paymentRecordId: latestPayment._id,

              resumeId: latestPayment.resume,

              invoiceNumber: latestPayment.invoiceNumber,

              requiresGeneration: true,
            });
          }

          return res.status(409).json({
            error: "PAYMENT_ALREADY_PROCESSED",
          });
        }

        return res.status(200).json({
          message: "PAYMENT_RECOVERED",

          status: "paid",

          paymentRecordId: recoveredPayment._id,

          resumeId: recoveredPayment.resume,

          invoiceNumber: recoveredPayment.invoiceNumber,

          requiresGeneration: true,
        });
      }

      const authorizedPayment = paymentAttempts.find(
        (attempt) =>
          attempt.order_id === paymentRecord.razorpayOrderId &&
          Number(attempt.amount) === RESUME_PRICE_PAISE &&
          attempt.currency === "INR" &&
          attempt.status === "authorized",
      );

      if (authorizedPayment) {
        return res.status(409).json({
          error: "PAYMENT_PROCESSING",

          paymentStatus: authorizedPayment.status,
        });
      }

      const cancelledAt = new Date();

      const cancelledPayment = await ResumePayment.findOneAndUpdate(
        {
          _id: paymentRecord._id,

          user: user._id,

          status: {
            $in: ["created", "failed"],
          },
        },
        {
          $set: {
            status: "cancelled",

            cancelledAt,

            failureReason: "USER_CANCELLED_CHECKOUT",
          },
        },
        {
          new: true,
        },
      );

      if (!cancelledPayment) {
        const latestPayment = await ResumePayment.findById(paymentRecord._id);

        if (latestPayment?.status === "cancelled") {
          return res.status(200).json({
            message: "PAYMENT_ALREADY_CANCELLED",

            paymentRecordId: latestPayment._id,

            status: "cancelled",
          });
        }

        if (latestPayment?.status === "paid") {
          return res.status(409).json({
            error: "PAID_PAYMENT_CANNOT_BE_CANCELLED",
          });
        }

        return res.status(409).json({
          error: "PAYMENT_CANCELLATION_CONFLICT",
        });
      }

      return res.status(200).json({
        message: "PAYMENT_CANCELLED",

        paymentRecordId: cancelledPayment._id,

        status: "cancelled",

        cancelledAt: cancelledPayment.cancelledAt,
      });
    } catch (error) {
      console.error("Resume payment cancellation failed:", error);

      return res.status(500).json({
        error: "PAYMENT_CANCELLATION_FAILED",
      });
    }
  },
);

router.get(
  "/:resumeId",
  verifyFirebaseToken,
  requirePremium,
  async (req, res) => {
    try {
      const user = req.dbUser;

      const resume = await Resume.findOne({
        _id: req.params.resumeId,
        user: user._id,
      });

      if (!resume) {
        return res.status(404).json({
          error: "RESUME_NOT_FOUND",
        });
      }

      return res.status(200).json({
        resume,
      });
    } catch (error) {
      console.error("Resume fetch failed:", error);

      return res.status(500).json({
        error: "RESUME_FETCH_FAILED",
      });
    }
  },
);
module.exports = router;
