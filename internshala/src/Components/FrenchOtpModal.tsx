import { FormEvent, useEffect, useState } from "react";

import { useTranslation } from "react-i18next";
import { auth } from "@/firebase/firebase";
import { toast } from "react-toastify";

interface FrenchOtpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: (language: "fr") => Promise<void>;
}

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

  // Countdown timer.
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!/^\d{6}$/.test(otp)) {
      toast.error(t("language.invalidOtpFormat"));
      return;
    }

    try {
      setIsVerifying(true);

      const currentUser = auth.currentUser;

      if (!currentUser) {
        toast.error(t("language.loginRequired"));
        return;
      }

      const idToken = await currentUser.getIdToken();

      const response = await fetch(
        "https://internshala-78tb.onrender.com/api/language/french/verify-otp",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            otp,
          }),
        },
      );

      const data = await response.json();

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

    try {
      setIsResending(true);

      const currentUser = auth.currentUser;

      if (!currentUser) {
        toast.error(t("language.loginRequired"));
        return;
      }

      const idToken = await currentUser.getIdToken();

      const response = await fetch(
        "https://internshala-78tb.onrender.com/api/language/french/request-otp",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      const data = await response.json();

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
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
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-xl tracking-[0.5em] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
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
