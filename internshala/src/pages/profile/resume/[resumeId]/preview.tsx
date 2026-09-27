import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  Loader2,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ReactNode, useEffect, useRef, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { selectuser } from "@/feature/userSlice";

declare global {
  interface Window {
    Razorpay: any;
  }
}

const API_URL = "https://internshala-78tb.onrender.com";

type ActivePayment = {
  order: {
    id: string;
    amount: number;
    currency: string;
  };
  paymentRecordId: string;
  keyId: string;
  testMode: boolean;
};

type GenerationResult = {
  versionNumber: number;
  invoiceNumber: string;
  pdfUrl: string;
};

const loadRazorpayScript = () => {
  return new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }

    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(true), {
        once: true,
      });

      existingScript.addEventListener("error", () => resolve(false), {
        once: true,
      });

      return;
    }

    const script = document.createElement("script");

    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;

    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);

    document.body.appendChild(script);
  });
};

const formatCountdown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const ResumeSection = ({
  title,
  children,
  accent,
  minimal,
}: {
  title: string;
  children: ReactNode;
  accent: string;
  minimal: boolean;
}) => {
  return (
    <section className="mt-5">
      <h2
        className="text-sm font-bold uppercase tracking-wide"
        style={{
          color: minimal ? "#222222" : accent,
        }}
      >
        {title}
      </h2>

      {!minimal && (
        <div
          className="mt-1.5 h-px w-full"
          style={{ backgroundColor: accent }}
        />
      )}

      <div className="mt-3 text-sm leading-6 text-gray-700">{children}</div>
    </section>
  );
};

const index = () => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const user = useSelector(selectuser);

  const resumeId =
    typeof router.query.resumeId === "string" ? router.query.resumeId : "";

  const [resume, setResume] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [flowError, setFlowError] = useState("");

  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);
  const [resendIn, setResendIn] = useState(0);

  const [requestingOtp, setRequestingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [preparingPayment, setPreparingPayment] = useState(false);

  const [activePayment, setActivePayment] = useState<ActivePayment | null>(
    null,
  );

  const [paidPaymentRecordId, setPaidPaymentRecordId] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paying, setPaying] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [generationResult, setGenerationResult] =
    useState<GenerationResult | null>(null);

  const [downloading, setDownloading] = useState(false);

  const paymentHandledRef = useRef(false);

  const apiRequest = async (path: string, options: RequestInit = {}) => {
    const firebaseUser = getAuth().currentUser;

    if (!firebaseUser) {
      throw new Error("AUTHENTICATION_REQUIRED");
    }

    const token = await firebaseUser.getIdToken();

    const headers = new Headers(options.headers);

    headers.set("Authorization", `Bearer ${token}`);

    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    return {
      response,
      data,
    };
  };

  useEffect(() => {
    if (!router.isReady || !resumeId) {
      return;
    }

    const auth = getAuth();
    const controller = new AbortController();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setFlowError(t("resumePreview.authenticationRequired"));
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setFlowError("");

        const token = await firebaseUser.getIdToken();

        const response = await fetch(`${API_URL}/api/resume/${resumeId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        const data = await response.json();

        if (response.status === 403 && data.error === "PREMIUM_REQUIRED") {
          setFlowError(t("resumeBuilder.premiumRequiredDescription"));
          return;
        }

        if (!response.ok) {
          throw new Error(data.error || "RESUME_FETCH_FAILED");
        }

        setResume(data.resume);
      } catch (error: any) {
        if (error?.name === "AbortError") {
          return;
        }

        console.error("Resume preview load failed:", error);

        setFlowError(t("resumePreview.loadFailed"));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    });

    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [router.isReady, resumeId, t]);

  useEffect(() => {
    if (!otpOpen) {
      return;
    }

    const timer = window.setInterval(() => {
      setOtpExpiresIn((prev) => Math.max(prev - 1, 0));
      setResendIn((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [otpOpen]);

  const content = resume?.content || {};
  const customization = resume?.customization || {};

  const accentColor = customization.color || "#2563EB";
  const template = customization.template || "classic";
  const font = customization.font || "Arial";

  const fontFamily =
    font === "Times New Roman"
      ? '"Times New Roman", serif'
      : font === "Georgia"
        ? "Georgia, serif"
        : font === "Helvetica"
          ? "Helvetica, Arial, sans-serif"
          : "Arial, sans-serif";

  const currentVersion = resume?.currentVersion || 0;

  const currentGeneratedVersion = resume?.versions?.find(
    (item: any) => item.versionNumber === currentVersion,
  );

  const isResumeComplete = () => {
    const validEducation = content.education?.some(
      (item: any) => item.institution?.trim() && item.degree?.trim(),
    );

    const validSkills = content.skills?.some((item: string) => item?.trim());

    return Boolean(
      content.fullName?.trim() &&
      content.email?.trim() &&
      content.phone?.trim() &&
      content.careerObjective?.trim() &&
      validEducation &&
      validSkills,
    );
  };

  const formatMonth = (value: string) => {
    if (!value) {
      return "";
    }

    const [year, month] = value.split("-");

    if (!year || !month) {
      return value;
    }

    const date = new Date(Number(year), Number(month) - 1, 1);

    return date.toLocaleDateString(i18n.resolvedLanguage || i18n.language, {
      month: "short",
      year: "numeric",
    });
  };

  const formatDateRange = (
    startDate: string,
    endDate: string,
    currentlyWorking = false,
  ) => {
    const start = formatMonth(startDate);

    const end = currentlyWorking
      ? t("resumePreview.present")
      : formatMonth(endDate);

    return [start, end].filter(Boolean).join(" - ");
  };

  const getOtpErrorMessage = (data: any) => {
    switch (data.error) {
      case "INVALID_OTP":
        return t("resumePreview.invalidOtp", {
          attempts: data.attemptsLeft,
        });

      case "OTP_EXPIRED":
        return t("resumePreview.otpExpired");

      case "OTP_TOO_MANY_ATTEMPTS":
        return t("resumePreview.tooManyOtpAttempts");

      case "OTP_ALREADY_USED":
        return t("resumePreview.otpAlreadyUsed");

      case "OTP_RESUME_MISMATCH":
        return t("resumePreview.otpMismatch");

      default:
        return t("resumePreview.otpVerificationFailed");
    }
  };

  const requestOtp = async () => {
    if (!isResumeComplete()) {
      setFlowError(t("resumePreview.incompleteResume"));
      return;
    }

    try {
      setRequestingOtp(true);
      setFlowError("");
      setOtpError("");
      setOtpVerified(false);

      const { response, data } = await apiRequest("/api/resume/request-otp", {
        method: "POST",
        body: JSON.stringify({
          resumeId,
        }),
      });

      if (response.status === 429 && data.error === "OTP_RESEND_TOO_SOON") {
        setOtpOpen(true);
        setResendIn(data.retryAfter || 60);

        setOtpError(
          t("resumePreview.otpResendTooSoon", {
            seconds: data.retryAfter || 60,
          }),
        );

        return;
      }

      if (
        response.status === 429 &&
        data.error === "OTP_REQUEST_LIMIT_REACHED"
      ) {
        setFlowError(t("resumePreview.otpRequestLimit"));
        return;
      }

      if (response.status === 400 && data.error === "INCOMPLETE_RESUME") {
        setFlowError(t("resumePreview.incompleteResume"));
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "OTP_SEND_FAILED");
      }

      setOtp("");
      setOtpOpen(true);
      setOtpExpiresIn(data.expiresIn || 600);
      setResendIn(60);
    } catch (error) {
      console.error("Resume OTP request failed:", error);

      setFlowError(t("resumePreview.otpSendFailed"));
    } finally {
      setRequestingOtp(false);
    }
  };

  const generateResume = async (paymentRecordId: string) => {
    try {
      setGenerating(true);
      setFlowError("");
      setPaymentError("");
      setPaidPaymentRecordId(paymentRecordId);

      const { response, data } = await apiRequest("/api/resume/generate", {
        method: "POST",
        body: JSON.stringify({
          resumeId,
          paymentRecordId,
        }),
      });

      if (
        response.status === 409 &&
        data.error === "RESUME_GENERATION_IN_PROGRESS"
      ) {
        setFlowError(t("resumePreview.generationInProgress"));
        return;
      }

      if (
        response.status === 409 &&
        data.error === "RESUME_GENERATION_ALREADY_CLAIMED"
      ) {
        setFlowError(t("resumePreview.generationInProgress"));
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "RESUME_GENERATION_FAILED");
      }

      setGenerationResult({
        versionNumber: data.versionNumber,
        invoiceNumber: data.invoiceNumber || "",
        pdfUrl: data.pdfUrl || "",
      });

      setActivePayment(null);
      setPaidPaymentRecordId("");
      setOtpOpen(false);

      setResume((prev: any) => ({
        ...prev,
        currentVersion: data.versionNumber,
        status: "generated",
        isDefault: true,
      }));
    } catch (error) {
      console.error("Resume generation failed:", error);

      setFlowError(t("resumePreview.generationFailed"));
    } finally {
      setGenerating(false);
    }
  };

  const syncPayment = async (paymentRecordId: string) => {
    const { response, data } = await apiRequest(
      `/api/resume/payments/${paymentRecordId}/sync`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      throw new Error(data.error || "PAYMENT_STATUS_SYNC_FAILED");
    }

    if (data.status === "paid") {
      await generateResume(paymentRecordId);

      return "paid";
    }

    if (data.status === "failed") {
      setPaymentError(t("resumePreview.paymentFailed"));

      return "failed";
    }

    setPaymentError(t("resumePreview.paymentPending"));

    return "pending";
  };

  const cancelPaymentAfterDismiss = async (paymentRecordId: string) => {
    try {
      const status = await syncPayment(paymentRecordId);

      if (status === "paid") {
        return;
      }

      const { response, data } = await apiRequest(
        `/api/resume/payments/${paymentRecordId}/cancel`,
        {
          method: "POST",
        },
      );

      if (data.status === "paid" || data.message === "PAYMENT_RECOVERED") {
        await generateResume(paymentRecordId);
        return;
      }

      if (response.status === 409 && data.error === "PAYMENT_PROCESSING") {
        setPaymentError(t("resumePreview.paymentProcessing"));
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "PAYMENT_CANCELLATION_FAILED");
      }

      setActivePayment(null);
      setOtpVerified(false);
      setPaymentError(t("resumePreview.paymentCancelled"));
    } catch (error) {
      console.error("Payment dismissal reconciliation failed:", error);

      setPaymentError(t("resumePreview.paymentStatusUnknown"));
    }
  };

  const verifyPayment = async (
    razorpayResponse: any,
    paymentRecordId: string,
  ) => {
    try {
      setPaying(true);
      setPaymentError("");

      const { response, data } = await apiRequest(
        "/api/resume/verify-payment",
        {
          method: "POST",
          body: JSON.stringify({
            razorpay_order_id: razorpayResponse.razorpay_order_id,
            razorpay_payment_id: razorpayResponse.razorpay_payment_id,
            razorpay_signature: razorpayResponse.razorpay_signature,
          }),
        },
      );

      if (!response.ok) {
        const syncedStatus = await syncPayment(paymentRecordId);

        if (syncedStatus !== "paid") {
          throw new Error(data.error || "PAYMENT_VERIFICATION_FAILED");
        }

        return;
      }

      await generateResume(data.paymentRecordId || paymentRecordId);
    } catch (error) {
      console.error("Payment verification failed:", error);

      setPaymentError(t("resumePreview.paymentVerificationFailed"));
    } finally {
      setPaying(false);
    }
  };

  const openCheckout = async (payment: ActivePayment) => {
    try {
      setPaying(true);
      setPaymentError("");

      const scriptLoaded = await loadRazorpayScript();

      if (!scriptLoaded || !window.Razorpay) {
        setPaymentError(t("resumePreview.paymentWindowFailed"));
        return;
      }

      paymentHandledRef.current = false;

      const razorpay = new window.Razorpay({
        key: payment.keyId,
        amount: payment.order.amount,
        currency: payment.order.currency,
        name: "Internshala",
        description: t("resumePreview.paymentDescription"),
        order_id: payment.order.id,

        prefill: {
          name: user?.name || content.fullName || "",
          email: user?.email || content.email || "",
          contact: user?.phoneNumber || content.phone || "",
        },

        theme: {
          color: accentColor,
        },

        handler: async (response: any) => {
          paymentHandledRef.current = true;

          await verifyPayment(response, payment.paymentRecordId);
        },

        modal: {
          ondismiss: async () => {
            if (paymentHandledRef.current) {
              return;
            }

            setPaying(false);

            await cancelPaymentAfterDismiss(payment.paymentRecordId);
          },
        },
      });

      razorpay.on("payment.failed", async () => {
        setPaymentError(t("resumePreview.paymentFailed"));

        try {
          await syncPayment(payment.paymentRecordId);
        } catch (error) {
          console.error("Payment failure sync failed:", error);
        }
      });

      razorpay.open();
    } catch (error) {
      console.error("Razorpay checkout failed:", error);

      setPaymentError(t("resumePreview.paymentWindowFailed"));
    } finally {
      setPaying(false);
    }
  };

  const preparePayment = async () => {
    try {
      setPreparingPayment(true);
      setOtpError("");
      setPaymentError("");

      const { response, data } = await apiRequest("/api/resume/create-order", {
        method: "POST",
        body: JSON.stringify({
          resumeId,
        }),
      });

      if (response.ok && data.status === "paid" && data.paymentRecordId) {
        setOtpOpen(false);

        await generateResume(data.paymentRecordId);

        return;
      }

      if (!response.ok) {
        if (
          data.error === "OTP_VERIFICATION_REQUIRED" ||
          data.error === "OTP_VERIFICATION_EXPIRED" ||
          data.error === "OTP_ALREADY_USED" ||
          data.error === "OTP_ALREADY_USED_OR_EXPIRED"
        ) {
          setOtpVerified(false);
          setOtpError(t("resumePreview.otpVerificationExpired"));
          return;
        }

        throw new Error(data.error || "ORDER_CREATION_FAILED");
      }

      if (!data.order?.id || !data.paymentRecordId || !data.keyId) {
        throw new Error("INVALID_PAYMENT_ORDER");
      }

      const payment: ActivePayment = {
        order: data.order,
        paymentRecordId: data.paymentRecordId,
        keyId: data.keyId,
        testMode: data.testMode === true,
      };

      setActivePayment(payment);
      setOtpOpen(false);

      await openCheckout(payment);
    } catch (error) {
      console.error("Payment order creation failed:", error);

      setOtpError(t("resumePreview.paymentPreparationFailed"));
    } finally {
      setPreparingPayment(false);
    }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setOtpError(t("resumePreview.enterValidOtp"));
      return;
    }

    if (otpExpiresIn <= 0) {
      setOtpError(t("resumePreview.otpExpired"));
      return;
    }

    try {
      setVerifyingOtp(true);
      setOtpError("");

      const { response, data } = await apiRequest("/api/resume/verify-otp", {
        method: "POST",
        body: JSON.stringify({
          resumeId,
          otp,
        }),
      });

      if (!response.ok) {
        setOtpError(getOtpErrorMessage(data));
        return;
      }

      setOtpVerified(true);

      await preparePayment();
    } catch (error) {
      console.error("OTP verification failed:", error);

      setOtpError(t("resumePreview.otpVerificationFailed"));
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleCheckPayment = async () => {
    const paymentRecordId =
      activePayment?.paymentRecordId || paidPaymentRecordId;

    if (!paymentRecordId) {
      return;
    }

    try {
      setCheckingPayment(true);
      setPaymentError("");

      await syncPayment(paymentRecordId);
    } catch (error) {
      console.error("Payment status check failed:", error);

      setPaymentError(t("resumePreview.paymentStatusUnknown"));
    } finally {
      setCheckingPayment(false);
    }
  };

  const downloadVersion = async (versionNumber: number) => {
    try {
      setDownloading(true);
      setFlowError("");

      const firebaseUser = getAuth().currentUser;

      if (!firebaseUser) {
        setFlowError(t("resumePreview.authenticationRequired"));
        return;
      }

      const token = await firebaseUser.getIdToken();

      const response = await fetch(
        `${API_URL}/api/resume/${resumeId}/version/${versionNumber}/download`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("RESUME_DOWNLOAD_FAILED");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const safeTitle = (resume?.title || "resume")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .replace(/_+/g, "_");

      const anchor = document.createElement("a");

      anchor.href = objectUrl;
      anchor.download = `${safeTitle}_v${versionNumber}.pdf`;

      document.body.appendChild(anchor);

      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("Resume download failed:", error);

      setFlowError(t("resumePreview.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />

          <p className="mt-3 text-sm text-gray-500">
            {t("resumePreview.loading")}
          </p>
        </div>
      </div>
    );
  }

  if (!resume) {
    return (
      <div className="min-h-screen bg-gray-50 py-10">
        <div className="max-w-3xl mx-auto px-4">
          <Link
            href="/profile/resume"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-blue-600"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("resumeBuilder.backToResumes")}
          </Link>

          <div className="mt-8 rounded-xl border border-red-200 bg-white p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-red-500" />

            <p className="mt-4 text-gray-700">
              {flowError || t("resumePreview.loadFailed")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const renderExperience = (items: any[], roleField: "position" | "role") => {
    return items.map((item, index) => (
      <div key={index} className={index === 0 ? "" : "mt-4"}>
        <p className="font-semibold text-gray-900">{item[roleField]}</p>

        <p className="text-gray-700">
          {[item.company, item.location].filter(Boolean).join(" · ")}
        </p>

        <p className="text-xs text-gray-500">
          {formatDateRange(item.startDate, item.endDate, item.currentlyWorking)}
        </p>

        {item.description && (
          <p className="mt-1 whitespace-pre-line">{item.description}</p>
        )}
      </div>
    ));
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link
                href={`/profile/resume/${resumeId}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-blue-600"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("resumePreview.backToEditor")}
              </Link>

              <h1 className="mt-4 text-2xl font-bold text-gray-900 sm:text-3xl">
                {t("resumePreview.title")}
              </h1>

              <p className="mt-2 text-sm text-gray-500">
                {t("resumePreview.description")}
              </p>
            </div>
          </div>

          {flowError && (
            <div className="mt-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{flowError}</span>
            </div>
          )}

          {paymentError && (
            <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{paymentError}</span>
            </div>
          )}

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_350px]">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">
                  {t("resumePreview.preview")}
                </h2>

                <span className="text-xs text-gray-500">
                  {t(`resumeEditor.${template}`)} · {font}
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-200 p-3 sm:p-6">
                <div
                  className="mx-auto min-h-[1120px] w-full max-w-[794px] bg-white shadow-sm"
                  style={{ fontFamily }}
                >
                  {template === "modern" ? (
                    <div
                      className="flex min-h-[145px] items-center justify-between gap-5 px-10 py-8 text-white"
                      style={{ backgroundColor: accentColor }}
                    >
                      <div>
                        <h1 className="text-3xl font-bold">
                          {content.fullName}
                        </h1>

                        <p className="mt-3 text-sm opacity-90">
                          {[content.email, content.phone, content.address]
                            .filter(Boolean)
                            .join(" | ")}
                        </p>
                      </div>

                      {content.profilePhoto && (
                        <img
                          src={content.profilePhoto}
                          alt=""
                          className="h-20 w-20 shrink-0 rounded-lg object-cover"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="px-10 pt-10">
                      <h1
                        className="text-3xl font-bold"
                        style={{
                          color:
                            template === "minimal" ? "#111111" : accentColor,
                        }}
                      >
                        {content.fullName}
                      </h1>

                      <p className="mt-2 text-sm text-gray-600">
                        {[content.email, content.phone, content.address]
                          .filter(Boolean)
                          .join(" | ")}
                      </p>

                      {template === "classic" && (
                        <div
                          className="mt-4 h-px"
                          style={{ backgroundColor: accentColor }}
                        />
                      )}
                    </div>
                  )}

                  <div
                    className={`px-10 pb-12 ${
                      template === "modern" ? "pt-5" : ""
                    }`}
                  >
                    {content.careerObjective && (
                      <ResumeSection
                        title={t("resumeBuilder.careerObjective")}
                        accent={accentColor}
                        minimal={template === "minimal"}
                      >
                        <p className="whitespace-pre-line">
                          {content.careerObjective}
                        </p>
                      </ResumeSection>
                    )}

                    {content.education?.length > 0 && (
                      <ResumeSection
                        title={t("resumeEditor.education")}
                        accent={accentColor}
                        minimal={template === "minimal"}
                      >
                        {content.education.map((item: any, index: number) => (
                          <div
                            key={index}
                            className={index === 0 ? "" : "mt-4"}
                          >
                            <p className="font-semibold text-gray-900">
                              {[item.degree, item.fieldOfStudy]
                                .filter(Boolean)
                                .join(" - ")}
                            </p>

                            <p>{item.institution}</p>

                            <p className="text-xs text-gray-500">
                              {formatDateRange(item.startDate, item.endDate)}
                            </p>

                            {item.grade && (
                              <p className="text-xs text-gray-600">
                                {t("resumeEditor.grade")}: {item.grade}
                              </p>
                            )}

                            {item.description && (
                              <p className="mt-1 whitespace-pre-line">
                                {item.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </ResumeSection>
                    )}

                    {content.skills?.filter(Boolean).length > 0 && (
                      <ResumeSection
                        title={t("resumeEditor.skills")}
                        accent={accentColor}
                        minimal={template === "minimal"}
                      >
                        <ul className="list-disc space-y-1 pl-5">
                          {content.skills
                            .filter(Boolean)
                            .map((skill: string, index: number) => (
                              <li key={index}>{skill}</li>
                            ))}
                        </ul>
                      </ResumeSection>
                    )}

                    {content.workExperience?.length > 0 && (
                      <ResumeSection
                        title={t("resumeEditor.workExperience")}
                        accent={accentColor}
                        minimal={template === "minimal"}
                      >
                        {renderExperience(content.workExperience, "position")}
                      </ResumeSection>
                    )}

                    {content.internships?.length > 0 && (
                      <ResumeSection
                        title={t("resumeEditor.internships")}
                        accent={accentColor}
                        minimal={template === "minimal"}
                      >
                        {renderExperience(content.internships, "role")}
                      </ResumeSection>
                    )}

                    {content.projects?.length > 0 && (
                      <ResumeSection
                        title={t("resumeEditor.projects")}
                        accent={accentColor}
                        minimal={template === "minimal"}
                      >
                        {content.projects.map((project: any, index: number) => (
                          <div
                            key={index}
                            className={index === 0 ? "" : "mt-4"}
                          >
                            <p className="font-semibold text-gray-900">
                              {project.title}
                            </p>

                            {project.technologies?.filter(Boolean).length >
                              0 && (
                              <p className="text-xs text-gray-500">
                                {project.technologies
                                  .filter(Boolean)
                                  .join(", ")}
                              </p>
                            )}

                            {project.description && (
                              <p className="mt-1 whitespace-pre-line">
                                {project.description}
                              </p>
                            )}

                            {project.projectUrl && (
                              <p
                                className="mt-1 break-all text-xs"
                                style={{ color: accentColor }}
                              >
                                {project.projectUrl}
                              </p>
                            )}

                            {project.githubUrl && (
                              <p
                                className="break-all text-xs"
                                style={{ color: accentColor }}
                              >
                                {project.githubUrl}
                              </p>
                            )}
                          </div>
                        ))}
                      </ResumeSection>
                    )}

                    {content.certifications?.length > 0 && (
                      <ResumeSection
                        title={t("resumeEditor.certifications")}
                        accent={accentColor}
                        minimal={template === "minimal"}
                      >
                        {content.certifications.map(
                          (item: any, index: number) => (
                            <div
                              key={index}
                              className={index === 0 ? "" : "mt-3"}
                            >
                              <p className="font-semibold text-gray-900">
                                {item.name}
                              </p>

                              <p className="text-sm">
                                {[
                                  item.organization,
                                  formatMonth(item.issueDate),
                                ]
                                  .filter(Boolean)
                                  .join(" | ")}
                              </p>

                              {item.credentialId && (
                                <p className="text-xs text-gray-500">
                                  {t("resumeEditor.credentialId")}:{" "}
                                  {item.credentialId}
                                </p>
                              )}

                              {item.credentialUrl && (
                                <p
                                  className="break-all text-xs"
                                  style={{ color: accentColor }}
                                >
                                  {item.credentialUrl}
                                </p>
                              )}
                            </div>
                          ),
                        )}
                      </ResumeSection>
                    )}

                    {content.achievements?.filter(Boolean).length > 0 && (
                      <ResumeSection
                        title={t("resumeEditor.achievements")}
                        accent={accentColor}
                        minimal={template === "minimal"}
                      >
                        <ul className="list-disc space-y-1 pl-5">
                          {content.achievements
                            .filter(Boolean)
                            .map((item: string, index: number) => (
                              <li key={index}>{item}</li>
                            ))}
                        </ul>
                      </ResumeSection>
                    )}

                    {content.languages?.length > 0 && (
                      <ResumeSection
                        title={t("resumeEditor.languages")}
                        accent={accentColor}
                        minimal={template === "minimal"}
                      >
                        <p>
                          {content.languages
                            .filter((item: any) => item.name)
                            .map((item: any) =>
                              item.proficiency
                                ? `${item.name} (${item.proficiency})`
                                : item.name,
                            )
                            .join(", ")}
                        </p>
                      </ResumeSection>
                    )}

                    {content.socialLinks?.length > 0 && (
                      <ResumeSection
                        title={t("resumeEditor.socialLinks")}
                        accent={accentColor}
                        minimal={template === "minimal"}
                      >
                        <div className="space-y-1">
                          {content.socialLinks
                            .filter((item: any) => item.url)
                            .map((item: any, index: number) => (
                              <p
                                key={index}
                                className="break-all"
                                style={{ color: accentColor }}
                              >
                                {item.platform
                                  ? `${item.platform}: ${item.url}`
                                  : item.url}
                              </p>
                            ))}
                        </div>
                      </ResumeSection>
                    )}

                    {content.references?.length > 0 && (
                      <ResumeSection
                        title={t("resumeEditor.references")}
                        accent={accentColor}
                        minimal={template === "minimal"}
                      >
                        {content.references.map((item: any, index: number) => (
                          <div
                            key={index}
                            className={index === 0 ? "" : "mt-3"}
                          >
                            <p className="font-semibold text-gray-900">
                              {item.name}
                            </p>

                            <p>
                              {[item.designation, item.company]
                                .filter(Boolean)
                                .join(", ")}
                            </p>

                            <p className="text-xs text-gray-500">
                              {[item.email, item.phone]
                                .filter(Boolean)
                                .join(" | ")}
                            </p>
                          </div>
                        ))}
                      </ResumeSection>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <aside className="lg:sticky lg:top-6 lg:self-start">
              {generationResult ? (
                <div className="rounded-2xl border border-green-200 bg-white p-6 shadow-sm">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  </div>

                  <h2 className="mt-4 text-xl font-bold text-gray-900">
                    {t("resumePreview.generatedTitle")}
                  </h2>

                  <p className="mt-2 text-sm text-gray-500">
                    {t("resumePreview.generatedDescription")}
                  </p>

                  <div className="mt-5 space-y-3 rounded-xl bg-gray-50 p-4 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500">
                        {t("resumePreview.version")}
                      </span>

                      <span className="font-medium text-gray-900">
                        v{generationResult.versionNumber}
                      </span>
                    </div>

                    {generationResult.invoiceNumber && (
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">
                          {t("resumePreview.invoice")}
                        </span>

                        <span className="text-right font-medium text-gray-900">
                          {generationResult.invoiceNumber}
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={downloading}
                    onClick={() =>
                      downloadVersion(generationResult.versionNumber)
                    }
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {downloading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}

                    {downloading
                      ? t("resumePreview.downloading")
                      : t("resumePreview.download")}
                  </button>

                  <Link
                    href="/profile/resume"
                    className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t("resumeBuilder.backToResumes")}
                  </Link>
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
                      <CreditCard className="h-5 w-5 text-blue-600" />
                    </div>

                    <div>
                      <h2 className="font-semibold text-gray-900">
                        {t("resumePreview.paymentTitle")}
                      </h2>

                      <p className="text-sm text-gray-500">
                        {t("resumePreview.priceDescription")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 rounded-xl bg-gray-50 p-5 text-center">
                    <p className="text-sm text-gray-500">
                      {t("resumePreview.priceLabel")}
                    </p>

                    <p className="mt-1 text-3xl font-bold text-gray-900">₹50</p>

                    <p className="mt-1 text-xs text-gray-500">
                      {t("resumePreview.perVersion")}
                    </p>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="flex gap-3">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />

                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {t("resumePreview.identityVerification")}
                        </p>

                        <p className="mt-1 text-xs leading-5 text-gray-500">
                          {t("resumePreview.identityVerificationDescription")}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />

                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {t("resumePreview.testMode")}
                        </p>

                        <p className="mt-1 text-xs leading-5 text-gray-500">
                          {t("resumePreview.testModeDescription")}
                        </p>
                      </div>
                    </div>
                  </div>

                  {currentGeneratedVersion && (
                    <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
                      <div className="flex items-start gap-3">
                        <FileText className="mt-0.5 h-5 w-5 text-blue-600" />

                        <div className="flex-1">
                          <p className="text-sm font-medium text-blue-900">
                            {t("resumePreview.currentVersion")} v
                            {currentVersion}
                          </p>

                          <p className="mt-1 text-xs leading-5 text-blue-700">
                            {t("resumePreview.currentVersionDescription")}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={downloading}
                        onClick={() => downloadVersion(currentVersion)}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                      >
                        <Download className="h-4 w-4" />
                        {t("resumePreview.downloadCurrent")}
                      </button>

                      <p className="mt-3 text-xs text-blue-700">
                        {t("resumePreview.payAgainNote")}
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={
                      requestingOtp || generating || paying || preparingPayment
                    }
                    onClick={requestOtp}
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {requestingOtp ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("resumePreview.requestingOtp")}
                      </>
                    ) : generating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("resumePreview.generating")}
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4" />
                        {currentVersion > 0
                          ? t("resumePreview.generateNewVersion")
                          : t("resumePreview.generateButton")}
                      </>
                    )}
                  </button>

                  {activePayment && (
                    <div className="mt-4 space-y-2">
                      <button
                        type="button"
                        disabled={paying}
                        onClick={() => openCheckout(activePayment)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                      >
                        <CreditCard className="h-4 w-4" />
                        {t("resumePreview.retryPayment")}
                      </button>

                      <button
                        type="button"
                        disabled={checkingPayment}
                        onClick={handleCheckPayment}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        {checkingPayment ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}

                        {t("resumePreview.checkPayment")}
                      </button>
                    </div>
                  )}

                  {paidPaymentRecordId && !generating && (
                    <button
                      type="button"
                      onClick={() => generateResume(paidPaymentRecordId)}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-green-200 px-4 py-2.5 text-sm font-medium text-green-700 hover:bg-green-50"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {t("resumePreview.retryGeneration")}
                    </button>
                  )}

                  <div className="mt-5 flex items-start gap-2 text-xs text-gray-500">
                    <ReceiptText className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{t("resumePreview.invoiceNote")}</p>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>

      {otpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50">
                  <ShieldCheck className="h-5 w-5 text-blue-600" />
                </div>

                <h2 className="mt-4 text-xl font-bold text-gray-900">
                  {t("resumePreview.otpTitle")}
                </h2>

                <p className="mt-2 text-sm leading-6 text-gray-500">
                  {t("resumePreview.otpDescription")}
                </p>
              </div>

              <button
                type="button"
                disabled={verifyingOtp || preparingPayment}
                onClick={() => setOtpOpen(false)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {user?.email && (
              <p className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
                {t("resumePreview.otpSentTo")}{" "}
                <span className="font-medium text-gray-900">{user.email}</span>
              </p>
            )}

            {otpError && (
              <div className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {otpError}
              </div>
            )}

            {!otpVerified ? (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "").slice(0, 6);

                    setOtp(value);
                    setOtpError("");
                  }}
                  placeholder={t("resumePreview.otpPlaceholder")}
                  className="mt-5 w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-2xl font-semibold tracking-[0.5em] text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />

                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {otpExpiresIn > 0
                      ? t("resumePreview.otpExpiresIn", {
                          time: formatCountdown(otpExpiresIn),
                        })
                      : t("resumePreview.otpExpired")}
                  </span>

                  <button
                    type="button"
                    disabled={resendIn > 0 || requestingOtp}
                    onClick={requestOtp}
                    className="font-medium text-blue-600 disabled:cursor-not-allowed disabled:text-gray-400"
                  >
                    {resendIn > 0
                      ? t("resumePreview.resendIn", {
                          seconds: resendIn,
                        })
                      : t("resumePreview.resendOtp")}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={
                    verifyingOtp ||
                    preparingPayment ||
                    otp.length !== 6 ||
                    otpExpiresIn <= 0
                  }
                  onClick={verifyOtp}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {verifyingOtp || preparingPayment ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {verifyingOtp
                        ? t("resumePreview.verifyingOtp")
                        : t("resumePreview.preparingPayment")}
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      {t("resumePreview.verifyOtp")}
                    </>
                  )}
                </button>
              </>
            ) : (
              <div className="mt-5">
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  {t("resumePreview.otpVerified")}
                </div>

                <button
                  type="button"
                  disabled={preparingPayment}
                  onClick={preparePayment}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {preparingPayment ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}

                  {t("resumePreview.continueToPayment")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default index;
