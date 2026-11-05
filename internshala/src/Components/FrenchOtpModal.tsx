import { SubmitEvent, useEffect, useState } from "react";

import { useTranslation } from "react-i18next";
import { auth } from "@/firebase/firebase";
import { toast } from "react-toastify";

import { authenticatedFetch } from "@/utils/authenticatedFetch";
import { getLoginSessionToken } from "@/utils/loginSession";

interface FrenchOtpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: (language: "fr") => Promise<void>;
}

const API_URL = "https://internshala-78tb.onrender.com";

export default function FrenchOtpModal({
  isOpen,
  onClose,
  onVerified,
}: FrenchOtpModalProps) {
  const { t } = useTranslation();

  const [otp, setOtp] = useState("");

  const [isVerifying, setIsVerifying] = useState(false);

  const [isResending, setIsResending] = useState(false);

  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setResendTimer(60);
    } else {
      setOtp("");
      setResendTimer(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (resendTimer <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendTimer((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [resendTimer]);

  if (!isOpen) {
    return null;
  }

  const hasAuthenticatedSession = () => {
    const currentUser = auth.currentUser;

    const loginSessionToken = getLoginSessionToken();

    return Boolean(currentUser && loginSessionToken);
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!/^\d{6}$/.test(otp)) {
      toast.error(t("language.invalidOtpFormat"));

      return;
    }

    if (!hasAuthenticatedSession()) {
      toast.error(t("language.loginRequired"));

      onClose();

      return;
    }

    try {
      setIsVerifying(true);

      const response = await authenticatedFetch(
        `${API_URL}/api/language/french/verify-otp`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            otp,
          }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data.error === "INVALID_OTP") {
          toast.error(
            t("language.invalidOtp", {
              attemptsLeft: data.attemptsLeft,
            }),
          );

          return;
        }

        if (data.error === "OTP_EXPIRED") {
          toast.error(t("language.otpExpired"));

          return;
        }

        if (data.error === "OTP_TOO_MANY_ATTEMPTS") {
          toast.error(t("language.tooManyOtpAttempts"));

          return;
        }

        if (data.error === "OTP_NOT_FOUND") {
          toast.error(t("language.otpNotFound"));

          return;
        }

        throw new Error(data.error || "OTP verification failed");
      }

      await onVerified(data.preferredLanguage);

      setOtp("");

      onClose();

      toast.success(t("language.frenchEnabled"));
    } catch (error) {
      console.error("OTP verification failed:", error);

      toast.error(t("language.verificationFailed"));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0 || isResending) {
      return;
    }

    if (!hasAuthenticatedSession()) {
      toast.error(t("language.loginRequired"));

      onClose();

      return;
    }

    try {
      setIsResending(true);

      const response = await authenticatedFetch(
        `${API_URL}/api/language/french/request-otp`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data.error === "OTP_RESEND_TOO_SOON") {
          setResendTimer(data.retryAfter || 60);

          toast.info(
            t("language.resendOtpIn", {
              seconds: data.retryAfter,
            }),
          );

          return;
        }

        if (data.error === "OTP_REQUEST_LIMIT_REACHED") {
          toast.error(t("language.otpRequestLimit"));

          return;
        }

        throw new Error(data.error || "OTP resend failed");
      }

      setOtp("");

      setResendTimer(60);

      toast.success(t("language.otpSent"));
    } catch (error) {
      console.error("OTP resend failed:", error);

      toast.error(t("language.otpSendFailed"));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 px-3 py-4">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
        <h2 className="text-xl font-semibold text-gray-900">
          {t("language.verifyFrench")}
        </h2>

        <p className="mt-2 text-sm text-gray-600">{t("language.enterOtp")}</p>

        <form onSubmit={handleSubmit} className="mt-6">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-3 text-center text-lg tracking-[0.25em] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 sm:px-4 sm:text-xl sm:tracking-[0.5em]"
          />

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={resendTimer > 0 || isResending}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {isResending
                ? t("language.resendingOtp")
                : resendTimer > 0
                  ? t("language.resendOtpIn", {
                      seconds: resendTimer,
                    })
                  : t("language.resendOtp")}
            </button>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setOtp("");

                onClose();
              }}
              disabled={isVerifying}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700"
            >
              {t("common.cancel")}
            </button>

            <button
              type="submit"
              disabled={isVerifying || otp.length !== 6}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isVerifying ? t("language.verifying") : t("language.verify")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
