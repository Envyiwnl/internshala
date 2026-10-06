import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  KeyRound,
  Mail,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { SubmitEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const API_URL = "https://internshala-78tb.onrender.com";

const RESET_SESSION_STORAGE_KEY = "internshala_password_reset_session";

type ResetMethod = "email" | "phone";

type Stage = "request" | "otp" | "delivery" | "success";

type ResetStatus = {
  resetMethod?: ResetMethod;
  destination?: string;
  passwordDestination?: string;
  status?: string;
  verificationStatus?: string;
  deliveryStatus?: string;
  otpExpiresAt?: string | null;
  sessionExpiresAt?: string | null;
  resendAvailableAt?: string | null;
  resendCount?: number;
  resendLimit?: number;
  otpAttempts?: number;
  otpAttemptLimit?: number;
  deliveryAttempts?: number;
  deliveryAttemptLimit?: number;
  canResend?: boolean;
  canRetryDelivery?: boolean;
  completedAt?: string | null;
  passwordDeliveredAt?: string | null;
};

type ApiResponse = {
  error?: string;
  message?: string;
  sessionToken?: string;
  passwordDestination?: string;
  resetMethod?: ResetMethod;
  destination?: string;
  otpExpiresAt?: string;
  sessionExpiresAt?: string;
  resendAvailableAt?: string;
  resendCount?: number;
  resendLimit?: number;
  otpAttempts?: number;
  otpAttemptLimit?: number;
  attemptsRemaining?: number;
  nextRequestAllowedAt?: string;
  canResend?: boolean;
  canRetryDelivery?: boolean;
  mustChangePassword?: boolean;
  reset?: ResetStatus;
};

const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const normalizePhoneNumber = (phoneNumber: string) => {
  return phoneNumber.replace(/[\s()-]/g, "").trim();
};

const isValidPhoneNumber = (phoneNumber: string) => {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhoneNumber(phoneNumber));
};

const getSecondsRemaining = (
  dateValue: string | null | undefined,
  currentTime: number,
) => {
  if (!dateValue) {
    return 0;
  }

  const difference = new Date(dateValue).getTime() - currentTime;

  return Math.max(0, Math.ceil(difference / 1000));
};

const formatCountdown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);

  const remainingSeconds = seconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

export default function ForgotPasswordPage() {
  const { t, i18n } = useTranslation();

  const [stage, setStage] = useState<Stage>("request");

  const [method, setMethod] = useState<ResetMethod>("email");

  const [identifier, setIdentifier] = useState("");

  const [otp, setOtp] = useState("");

  const [sessionToken, setSessionToken] = useState("");

  const [destination, setDestination] = useState("");

  const [passwordDestination, setPasswordDestination] = useState("");

  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);

  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);

  const [resendAvailableAt, setResendAvailableAt] = useState<string | null>(
    null,
  );

  const [nextRequestAllowedAt, setNextRequestAllowedAt] = useState<
    string | null
  >(null);

  const [resendCount, setResendCount] = useState(0);

  const [resendLimit, setResendLimit] = useState(3);

  const [otpAttempts, setOtpAttempts] = useState(0);

  const [otpAttemptLimit, setOtpAttemptLimit] = useState(5);

  const [deliveryAttempts, setDeliveryAttempts] = useState(0);

  const [deliveryAttemptLimit, setDeliveryAttemptLimit] = useState(3);

  const [canRetryDelivery, setCanRetryDelivery] = useState(false);

  const [loading, setLoading] = useState(false);

  const [restoring, setRestoring] = useState(true);

  const [error, setError] = useState("");

  const [notice, setNotice] = useState("");

  const [currentTime, setCurrentTime] = useState(Date.now());

  const otpSecondsRemaining = useMemo(
    () => getSecondsRemaining(otpExpiresAt, currentTime),
    [otpExpiresAt, currentTime],
  );

  const resendSecondsRemaining = useMemo(
    () => getSecondsRemaining(resendAvailableAt, currentTime),
    [resendAvailableAt, currentTime],
  );

  const sessionSecondsRemaining = useMemo(
    () => getSecondsRemaining(sessionExpiresAt, currentTime),
    [sessionExpiresAt, currentTime],
  );

  const otpExpired = Boolean(otpExpiresAt) && otpSecondsRemaining === 0;

  const sessionExpired =
    Boolean(sessionExpiresAt) && sessionSecondsRemaining === 0;

  const attemptsRemaining = Math.max(0, otpAttemptLimit - otpAttempts);

  const resendsRemaining = Math.max(0, resendLimit - resendCount);

  const getErrorMessage = useCallback(
    (errorCode?: string, response?: ApiResponse) => {
      switch (errorCode) {
        case "INVALID_RESET_METHOD":
          return t("forgotPassword.errors.invalidMethod");

        case "RESET_IDENTIFIER_REQUIRED":
          return t("forgotPassword.errors.identifierRequired");

        case "INVALID_USER_DETAILS":
          return t("forgotPassword.errors.invalidUser");

        case "PASSWORD_RESET_NOT_AVAILABLE":
          return t("forgotPassword.errors.passwordResetUnavailable");

        case "PASSWORD_RESET_DAILY_LIMIT":
          return t("forgotPassword.errors.dailyLimit");

        case "PASSWORD_RESET_ALREADY_ACTIVE":
          return t("forgotPassword.errors.alreadyActive");

        case "PASSWORD_RESET_OTP_DELIVERY_FAILED":
          return t("forgotPassword.errors.otpDeliveryFailed");

        case "PASSWORD_RESET_REQUEST_FAILED":
          return t("forgotPassword.errors.requestFailed");

        case "PASSWORD_RESET_SESSION_NOT_FOUND":
          return t("forgotPassword.errors.sessionNotFound");

        case "PASSWORD_RESET_SESSION_CLOSED":
          return t("forgotPassword.errors.sessionClosed");

        case "PASSWORD_RESET_SESSION_EXPIRED":
          return t("forgotPassword.errors.sessionExpired");

        case "INVALID_OTP_FORMAT":
          return t("forgotPassword.errors.invalidOtpFormat");

        case "INVALID_OTP":
          if (typeof response?.attemptsRemaining === "number") {
            return t("forgotPassword.errors.invalidOtpWithAttempts", {
              count: response.attemptsRemaining,
            });
          }

          return t("forgotPassword.errors.invalidOtp");

        case "OTP_EXPIRED":
          return t("forgotPassword.errors.otpExpired");

        case "OTP_ALREADY_VERIFIED":
          return t("forgotPassword.errors.otpAlreadyVerified");

        case "OTP_ATTEMPTS_EXCEEDED":
          return t("forgotPassword.errors.otpAttemptsExceeded");

        case "OTP_RESEND_LIMIT_REACHED":
          return t("forgotPassword.errors.resendLimitReached");

        case "OTP_RESEND_COOLDOWN":
          return t("forgotPassword.errors.resendCooldown");

        case "OTP_RESEND_CONFLICT":
          return t("forgotPassword.errors.resendConflict");

        case "PASSWORD_RESET_OTP_RESEND_FAILED":
          return t("forgotPassword.errors.resendFailed");

        case "OTP_VERIFICATION_CONFLICT":
          return t("forgotPassword.errors.verificationConflict");

        case "PASSWORD_RESET_ALREADY_COMPLETED":
          return t("forgotPassword.errors.alreadyCompleted");

        case "TEMPORARY_PASSWORD_DELIVERY_FAILED":
          return t("forgotPassword.errors.passwordDeliveryFailed");

        case "TEMPORARY_PASSWORD_UPDATE_FAILED":
          return t("forgotPassword.errors.passwordUpdateFailed");

        case "PASSWORD_DELIVERY_ATTEMPTS_EXCEEDED":
          return t("forgotPassword.errors.deliveryAttemptsExceeded");

        case "PASSWORD_DELIVERY_IN_PROGRESS":
          return t("forgotPassword.errors.deliveryInProgress");

        case "PASSWORD_DELIVERY_NOT_AVAILABLE":
          return t("forgotPassword.errors.deliveryUnavailable");

        case "PASSWORD_DELIVERY_RETRY_FAILED":
          return t("forgotPassword.errors.deliveryRetryFailed");

        case "PASSWORD_RESET_STATUS_FAILED":
          return t("forgotPassword.errors.statusFailed");

        case "USER_NOT_FOUND":
          return t("forgotPassword.errors.invalidUser");

        default:
          return t("forgotPassword.errors.generic");
      }
    },
    [t],
  );

  const saveSessionToken = (token: string) => {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(RESET_SESSION_STORAGE_KEY, token);
  };

  const clearStoredSession = () => {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.removeItem(RESET_SESSION_STORAGE_KEY);
  };

  const fetchApi = async (endpoint: string, body: Record<string, unknown>) => {
    const response = await fetch(`${API_URL}/api/password-reset/${endpoint}`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(body),
    });

    const data: ApiResponse = await response.json().catch(() => ({}));

    return {
      response,
      data,
    };
  };

  const applyStatus = useCallback(
    (reset: ResetStatus) => {
      if (reset.resetMethod) {
        setMethod(reset.resetMethod);
      }

      setDestination(reset.destination || "");

      setPasswordDestination(reset.passwordDestination || "");

      setOtpExpiresAt(reset.otpExpiresAt || null);

      setSessionExpiresAt(reset.sessionExpiresAt || null);

      setResendAvailableAt(reset.resendAvailableAt || null);

      setResendCount(reset.resendCount || 0);

      setResendLimit(reset.resendLimit || 3);

      setOtpAttempts(reset.otpAttempts || 0);

      setOtpAttemptLimit(reset.otpAttemptLimit || 5);

      setDeliveryAttempts(reset.deliveryAttempts || 0);

      setDeliveryAttemptLimit(reset.deliveryAttemptLimit || 3);

      setCanRetryDelivery(Boolean(reset.canRetryDelivery));

      if (reset.status === "completed") {
        setStage("success");
        setError("");
        return;
      }

      if (
        reset.status === "delivery_failed" ||
        reset.status === "password_updated" ||
        (reset.verificationStatus === "verified" &&
          reset.deliveryStatus !== "sent")
      ) {
        setStage("delivery");

        if (reset.deliveryStatus === "failed") {
          setError(t("forgotPassword.errors.passwordDeliveryFailed"));
        }

        return;
      }

      if (
        reset.status === "expired" ||
        reset.status === "failed" ||
        !reset.verificationStatus
      ) {
        setStage("request");
        clearStoredSession();
        return;
      }

      setStage("otp");
    },
    [t],
  );

  const restoreStatus = useCallback(
    async (token: string, showLoading = true) => {
      if (!token) {
        if (showLoading) {
          setRestoring(false);
        }

        return;
      }

      try {
        if (showLoading) {
          setRestoring(true);
        }

        const { response, data } = await fetchApi("status", {
          sessionToken: token,
        });

        if (!response.ok) {
          if (
            data.error === "PASSWORD_RESET_SESSION_NOT_FOUND" ||
            data.error === "PASSWORD_RESET_SESSION_CLOSED"
          ) {
            clearStoredSession();
            setSessionToken("");
            setStage("request");
          }

          return;
        }

        if (!data.reset) {
          return;
        }

        setSessionToken(token);

        applyStatus(data.reset);
      } catch (statusError) {
        console.error("Password reset status recovery failed:", statusError);
      } finally {
        if (showLoading) {
          setRestoring(false);
        }
      }
    },
    [applyStatus],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedToken = window.sessionStorage.getItem(RESET_SESSION_STORAGE_KEY);

    if (!savedToken) {
      setRestoring(false);
      return;
    }

    setSessionToken(savedToken);

    restoreStatus(savedToken);
  }, [restoreStatus]);

  useEffect(() => {
    if (stage !== "otp" && stage !== "delivery") {
      return;
    }

    const interval = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [stage]);

  const validateIdentifier = () => {
    const value = identifier.trim();

    if (!value) {
      setError(t("forgotPassword.errors.identifierRequired"));

      return false;
    }

    if (method === "email" && !isValidEmail(value)) {
      setError(t("forgotPassword.errors.invalidEmail"));

      return false;
    }

    if (method === "phone" && !isValidPhoneNumber(value)) {
      setError(t("forgotPassword.errors.invalidPhone"));

      return false;
    }

    return true;
  };

  const handleRequest = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading || !validateIdentifier()) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      setNotice("");

      const normalizedIdentifier =
        method === "phone"
          ? normalizePhoneNumber(identifier)
          : identifier.trim().toLowerCase();

      const { response, data } = await fetchApi("request", {
        method,
        identifier: normalizedIdentifier,
        language: i18n.resolvedLanguage || i18n.language || "en",
      });

      if (!response.ok) {
        if (data.nextRequestAllowedAt) {
          setNextRequestAllowedAt(data.nextRequestAllowedAt);
        }

        setError(getErrorMessage(data.error, data));

        return;
      }

      if (!data.sessionToken) {
        setError(t("forgotPassword.errors.requestFailed"));

        return;
      }

      setSessionToken(data.sessionToken);

      saveSessionToken(data.sessionToken);

      setDestination(data.destination || "");

      setPasswordDestination(data.passwordDestination || "");

      setOtpExpiresAt(data.otpExpiresAt || null);

      setSessionExpiresAt(data.sessionExpiresAt || null);

      setResendAvailableAt(data.resendAvailableAt || null);

      setNextRequestAllowedAt(data.nextRequestAllowedAt || null);

      setResendCount(0);

      setResendLimit(data.resendLimit || 3);

      setOtpAttempts(0);

      setOtpAttemptLimit(data.otpAttemptLimit || 5);

      setOtp("");

      setStage("otp");

      setCurrentTime(Date.now());

      setNotice(
        t("forgotPassword.otpSent", {
          destination: data.destination || "",
        }),
      );
    } catch (requestError) {
      console.error("Password reset request network failure:", requestError);

      setError(t("forgotPassword.errors.networkError"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading || !sessionToken) {
      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      setError(t("forgotPassword.errors.invalidOtpFormat"));

      return;
    }

    if (sessionExpired) {
      setError(t("forgotPassword.errors.sessionExpired"));

      return;
    }

    if (otpExpired) {
      setError(t("forgotPassword.errors.otpExpired"));

      return;
    }

    try {
      setLoading(true);
      setError("");
      setNotice("");

      const { response, data } = await fetchApi("verify", {
        sessionToken,
        otp,
      });

      if (data.passwordDestination) {
        setPasswordDestination(data.passwordDestination);
      }

      if (!response.ok) {
        if (
          data.error === "INVALID_OTP" &&
          typeof data.attemptsRemaining === "number"
        ) {
          setOtpAttempts(otpAttemptLimit - data.attemptsRemaining);
        }

        if (data.error === "OTP_ATTEMPTS_EXCEEDED") {
          setOtpAttempts(otpAttemptLimit);
        }

        if (
          data.error === "TEMPORARY_PASSWORD_DELIVERY_FAILED" ||
          data.error === "TEMPORARY_PASSWORD_UPDATE_FAILED" ||
          data.canRetryDelivery
        ) {
          setCanRetryDelivery(true);
          setStage("delivery");
        }

        if (data.error === "PASSWORD_RESET_ALREADY_COMPLETED") {
          await restoreStatus(sessionToken, false);

          return;
        }

        setError(getErrorMessage(data.error, data));

        return;
      }

      setDestination(data.destination || destination);

      setCanRetryDelivery(false);

      setStage("success");

      setError("");

      setNotice("");
    } catch (verifyError) {
      console.error(
        "Password reset verification network failure:",
        verifyError,
      );

      setError(t("forgotPassword.errors.verificationNetworkError"));

      await restoreStatus(sessionToken, false);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (
      loading ||
      !sessionToken ||
      resendSecondsRemaining > 0 ||
      resendsRemaining <= 0 ||
      sessionExpired
    ) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      setNotice("");

      const { response, data } = await fetchApi("resend", {
        sessionToken,
      });

      if (!response.ok) {
        if (data.resendAvailableAt) {
          setResendAvailableAt(data.resendAvailableAt);
        }

        setError(getErrorMessage(data.error, data));

        return;
      }

      setOtp("");

      setDestination(data.destination || destination);

      setOtpExpiresAt(data.otpExpiresAt || null);

      setResendAvailableAt(data.resendAvailableAt || null);

      setResendCount(data.resendCount ?? resendCount + 1);

      setResendLimit(data.resendLimit || resendLimit);

      setOtpAttempts(data.otpAttempts ?? otpAttempts);

      setOtpAttemptLimit(data.otpAttemptLimit || otpAttemptLimit);

      setCurrentTime(Date.now());

      setNotice(t("forgotPassword.otpResent"));
    } catch (resendError) {
      console.error("Password reset resend network failure:", resendError);

      setError(t("forgotPassword.errors.networkError"));
    } finally {
      setLoading(false);
    }
  };

  const handleRetryDelivery = async () => {
    if (loading || !sessionToken || !canRetryDelivery) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      setNotice("");

      const { response, data } = await fetchApi("retry-delivery", {
        sessionToken,
      });

      if (data.passwordDestination) {
        setPasswordDestination(data.passwordDestination);
      }

      if (!response.ok) {
        if (data.error === "PASSWORD_RESET_ALREADY_COMPLETED") {
          await restoreStatus(sessionToken, false);

          return;
        }

        setCanRetryDelivery(Boolean(data.canRetryDelivery));

        setError(getErrorMessage(data.error, data));

        return;
      }

      setDestination(data.destination || destination);

      setCanRetryDelivery(false);

      setStage("success");
    } catch (deliveryError) {
      console.error(
        "Temporary password delivery retry network failure:",
        deliveryError,
      );

      setError(t("forgotPassword.errors.deliveryNetworkError"));

      await restoreStatus(sessionToken, false);
    } finally {
      setLoading(false);
    }
  };

  const handleMethodChange = (newMethod: ResetMethod) => {
    if (loading) {
      return;
    }

    setMethod(newMethod);
    setIdentifier("");
    setError("");
    setNotice("");
    setNextRequestAllowedAt(null);
  };

  if (restoring) {
    return (
      <main className="min-h-[calc(100vh-8rem)] bg-gray-50 px-4 py-14">
        <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-lg">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-blue-600" />

          <p className="mt-4 text-sm text-gray-600">
            {t("forgotPassword.restoringSession")}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-8rem)] bg-gray-50 px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/auth?mode=login"
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-blue-600"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("forgotPassword.backToLogin")}
        </Link>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
          <div className="px-6 pb-5 pt-7 text-center sm:px-8">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
              {stage === "success" ? (
                <CheckCircle2 className="h-6 w-6" />
              ) : (
                <KeyRound className="h-6 w-6" />
              )}
            </div>

            <h1 className="text-2xl font-bold text-gray-900">
              {stage === "success"
                ? t("forgotPassword.successTitle")
                : t("forgotPassword.title")}
            </h1>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              {stage === "request" && t("forgotPassword.description")}

              {stage === "otp" &&
                t("forgotPassword.otpDescription", {
                  destination,
                })}

              {stage === "delivery" &&
                t("forgotPassword.deliveryDescription", {
                  destination: passwordDestination || destination,
                })}

              {stage === "success" &&
                t("forgotPassword.successDescription", {
                  destination: passwordDestination || destination,
                })}
            </p>
          </div>

          {stage === "request" && (
            <form
              onSubmit={handleRequest}
              className="space-y-5 px-6 pb-8 sm:px-8"
            >
              <div className="grid grid-cols-2 rounded-xl bg-gray-100 p-1">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleMethodChange("email")}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                    method === "email"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <Mail className="h-4 w-4" />
                  {t("forgotPassword.emailMethod")}
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleMethodChange("phone")}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                    method === "phone"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <Smartphone className="h-4 w-4" />
                  {t("forgotPassword.phoneMethod")}
                </button>
              </div>

              <div>
                <label
                  htmlFor="identifier"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  {method === "email"
                    ? t("forgotPassword.registeredEmail")
                    : t("forgotPassword.registeredPhone")}
                </label>

                <div className="relative">
                  {method === "email" ? (
                    <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  ) : (
                    <Smartphone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  )}

                  <input
                    id="identifier"
                    type={method === "email" ? "email" : "tel"}
                    autoComplete={method === "email" ? "email" : "tel"}
                    value={identifier}
                    onChange={(event) => {
                      setIdentifier(event.target.value);

                      if (error) {
                        setError("");
                      }
                    }}
                    disabled={loading}
                    placeholder={
                      method === "email"
                        ? t("forgotPassword.emailPlaceholder")
                        : t("forgotPassword.phonePlaceholder")
                    }
                    className="w-full rounded-lg border border-gray-300 py-3 pl-11 pr-4 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                  />
                </div>

                {method === "phone" && (
                  <p className="mt-2 text-xs leading-5 text-gray-500">
                    {t("forgotPassword.phoneHint")}
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />

                  <p className="text-xs leading-5 text-blue-800">
                    {t("forgotPassword.securityNotice")}
                  </p>
                </div>
              </div>

              {nextRequestAllowedAt && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {t("forgotPassword.nextRequestAvailable", {
                    date: new Date(nextRequestAllowedAt).toLocaleString(),
                  })}
                </div>
              )}

              {notice && (
                <div
                  role="status"
                  className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
                >
                  {notice}
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                {loading
                  ? t("forgotPassword.sendingOtp")
                  : t("forgotPassword.sendOtp")}
              </button>
            </form>
          )}

          {stage === "otp" && (
            <form
              onSubmit={handleVerifyOtp}
              className="space-y-5 px-6 pb-8 sm:px-8"
            >
              <div>
                <label
                  htmlFor="otp"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  {t("forgotPassword.enterOtp")}
                </label>

                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => {
                    const value = event.target.value.replace(/\D/g, "");

                    setOtp(value.slice(0, 6));

                    if (error) {
                      setError("");
                    }
                  }}
                  disabled={loading}
                  placeholder={t("forgotPassword.otpPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-xl font-semibold tracking-[0.5em] text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <Clock3 className="mx-auto h-4 w-4 text-gray-500" />

                  <p className="mt-1 text-xs text-gray-500">
                    {t("forgotPassword.otpExpires")}
                  </p>

                  <p
                    className={`mt-1 text-sm font-semibold ${
                      otpExpired ? "text-red-600" : "text-gray-900"
                    }`}
                  >
                    {otpExpired
                      ? t("forgotPassword.expired")
                      : formatCountdown(otpSecondsRemaining)}
                  </p>
                </div>

                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <ShieldCheck className="mx-auto h-4 w-4 text-gray-500" />

                  <p className="mt-1 text-xs text-gray-500">
                    {t("forgotPassword.attemptsRemaining")}
                  </p>

                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {attemptsRemaining}
                  </p>
                </div>
              </div>

              {sessionExpired && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {t("forgotPassword.errors.sessionExpired")}
                </div>
              )}

              {notice && (
                <div
                  role="status"
                  className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
                >
                  {notice}
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  loading ||
                  otp.length !== 6 ||
                  otpExpired ||
                  sessionExpired ||
                  attemptsRemaining === 0
                }
                className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                {loading
                  ? t("forgotPassword.verifying")
                  : t("forgotPassword.verifyOtp")}
              </button>

              <div className="text-center">
                <p className="text-xs text-gray-500">
                  {t("forgotPassword.didNotReceive")}
                </p>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={
                    loading ||
                    resendSecondsRemaining > 0 ||
                    resendsRemaining <= 0 ||
                    sessionExpired
                  }
                  className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  <RefreshCw className="h-4 w-4" />

                  {resendsRemaining <= 0
                    ? t("forgotPassword.resendLimitReached")
                    : resendSecondsRemaining > 0
                      ? t("forgotPassword.resendIn", {
                          seconds: resendSecondsRemaining,
                        })
                      : t("forgotPassword.resendOtp")}
                </button>

                <p className="mt-2 text-xs text-gray-400">
                  {t("forgotPassword.resendsRemaining", {
                    count: resendsRemaining,
                  })}
                </p>
              </div>
            </form>
          )}

          {stage === "delivery" && (
            <div className="space-y-5 px-6 pb-8 sm:px-8">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />

                  <div>
                    <h2 className="text-sm font-semibold text-amber-900">
                      {t("forgotPassword.deliveryIssueTitle")}
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-amber-800">
                      {t("forgotPassword.deliveryIssueDescription")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
                {t("forgotPassword.deliveryAttempts", {
                  used: deliveryAttempts,
                  total: deliveryAttemptLimit,
                })}
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleRetryDelivery}
                disabled={loading || !canRetryDelivery}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />

                {loading
                  ? t("forgotPassword.retryingDelivery")
                  : t("forgotPassword.retryDelivery")}
              </button>

              {!canRetryDelivery && (
                <p className="text-center text-xs leading-5 text-gray-500">
                  {t("forgotPassword.deliveryRetryUnavailable")}
                </p>
              )}
            </div>
          )}

          {stage === "success" && (
            <div className="space-y-5 px-6 pb-8 sm:px-8">
              <div className="rounded-xl border border-green-200 bg-green-50 p-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-green-600" />

                  <div>
                    <h2 className="font-semibold text-green-900">
                      {t("forgotPassword.passwordSentTitle")}
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-green-800">
                      {t("forgotPassword.passwordSentDescription", {
                        destination: passwordDestination || destination,
                      })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-sm font-semibold text-blue-900">
                  {t("forgotPassword.nextStepsTitle")}
                </p>

                <ol className="mt-3 space-y-2 text-sm leading-6 text-blue-800">
                  <li>1. {t("forgotPassword.nextStepOne")}</li>

                  <li>2. {t("forgotPassword.nextStepTwo")}</li>

                  <li>3. {t("forgotPassword.nextStepThree")}</li>
                </ol>
              </div>

              <p className="text-center text-xs leading-5 text-gray-500">
                {t("forgotPassword.passwordNeverShown")}
              </p>

              <Link
                href="/auth?mode=login"
                className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                {t("forgotPassword.goToLogin")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
