import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/router";
import { SubmitEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import {
  onAuthStateChanged,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";

import { auth } from "@/firebase/firebase";

const API_URL = "https://internshala-78tb.onrender.com";

const RESET_SESSION_STORAGE_KEY = "internshala_password_reset_session";

export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);

  const [authLoading, setAuthLoading] = useState(true);

  const [newPassword, setNewPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [showNewPassword, setShowNewPassword] = useState(false);

  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);

      if (!user) {
        router.replace("/auth?mode=login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const getErrorMessage = (errorCode?: string) => {
    switch (errorCode) {
      case "NEW_PASSWORD_REQUIRED":
        return t("changePassword.errors.required");

      case "INVALID_NEW_PASSWORD_LENGTH":
        return t("changePassword.errors.passwordLength");

      case "USER_NOT_FOUND":
        return t("changePassword.errors.userNotFound");

      case "PASSWORD_CHANGE_NOT_REQUIRED":
        return t("changePassword.errors.notRequired");

      case "INVALID_TOKEN":
      case "UNAUTHORIZED":
        return t("changePassword.errors.sessionExpired");

      case "PASSWORD_CHANGE_FAILED":
        return t("changePassword.errors.changeFailed");

      default:
        return t("changePassword.errors.generic");
    }
  };

  const validateForm = () => {
    if (!newPassword || !confirmPassword) {
      setError(t("changePassword.errors.required"));

      return false;
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      setError(t("changePassword.errors.passwordLength"));

      return false;
    }

    if (newPassword !== confirmPassword) {
      setError(t("changePassword.errors.passwordMismatch"));

      return false;
    }

    return true;
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading || !firebaseUser || !validateForm()) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const idToken = await firebaseUser.getIdToken();

      const response = await fetch(
        `${API_URL}/api/password-reset/change-password`,
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            newPassword,
          }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data.error === "PASSWORD_CHANGE_NOT_REQUIRED") {
          await router.replace("/");
          return;
        }

        if (data.error === "INVALID_TOKEN" || data.error === "UNAUTHORIZED") {
          await signOut(auth);

          await router.replace("/auth?mode=login");

          return;
        }

        setError(getErrorMessage(data.error));

        return;
      }

      setSuccess(true);

      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(RESET_SESSION_STORAGE_KEY);
      }

      toast.success(t("changePassword.successToast"));

      await signOut(auth);

      setTimeout(() => {
        router.replace("/auth?mode=login");
      }, 1200);
    } catch (changeError) {
      console.error("Password change failed:", changeError);

      setError(t("changePassword.errors.networkError"));
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-[calc(100vh-8rem)] bg-gray-50 px-4 py-14">
        <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />

          <p className="mt-4 text-sm text-gray-600">
            {t("changePassword.checkingSession")}
          </p>
        </div>
      </main>
    );
  }

  if (!firebaseUser) {
    return null;
  }

  return (
    <main className="min-h-[calc(100vh-8rem)] bg-gray-50 px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
          <div className="px-6 pb-5 pt-7 text-center sm:px-8">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
              {success ? (
                <CheckCircle2 className="h-6 w-6" />
              ) : (
                <KeyRound className="h-6 w-6" />
              )}
            </div>

            <h1 className="text-2xl font-bold text-gray-900">
              {success
                ? t("changePassword.successTitle")
                : t("changePassword.title")}
            </h1>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              {success
                ? t("changePassword.successDescription")
                : t("changePassword.description")}
            </p>
          </div>

          {!success ? (
            <form
              onSubmit={handleSubmit}
              className="space-y-5 px-6 pb-8 sm:px-8"
            >
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />

                  <p className="text-sm leading-6 text-amber-800">
                    {t("changePassword.securityNotice")}
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="newPassword"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  {t("changePassword.newPassword")}
                </label>

                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

                  <input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => {
                      setNewPassword(event.target.value);

                      if (error) {
                        setError("");
                      }
                    }}
                    disabled={loading}
                    placeholder={t("changePassword.newPasswordPlaceholder")}
                    className="w-full rounded-lg border border-gray-300 py-3 pl-11 pr-11 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                  />

                  <button
                    type="button"
                    onClick={() => setShowNewPassword((previous) => !previous)}
                    disabled={loading}
                    aria-label={
                      showNewPassword
                        ? t("changePassword.hidePassword")
                        : t("changePassword.showPassword")
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-700"
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>

                <p className="mt-2 text-xs leading-5 text-gray-500">
                  {t("changePassword.passwordHint")}
                </p>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  {t("changePassword.confirmPassword")}
                </label>

                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);

                      if (error) {
                        setError("");
                      }
                    }}
                    disabled={loading}
                    placeholder={t("changePassword.confirmPasswordPlaceholder")}
                    className="w-full rounded-lg border border-gray-300 py-3 pl-11 pr-11 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword((previous) => !previous)
                    }
                    disabled={loading}
                    aria-label={
                      showConfirmPassword
                        ? t("changePassword.hidePassword")
                        : t("changePassword.showPassword")
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-700"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
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
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                {loading
                  ? t("changePassword.updating")
                  : t("changePassword.updatePassword")}
              </button>
            </form>
          ) : (
            <div className="space-y-5 px-6 pb-8 sm:px-8">
              <div className="rounded-xl border border-green-200 bg-green-50 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-600" />

                  <div>
                    <h2 className="font-semibold text-green-900">
                      {t("changePassword.passwordUpdated")}
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-green-800">
                      {t("changePassword.loginAgain")}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-center text-sm text-gray-500">
                {t("changePassword.redirecting")}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
