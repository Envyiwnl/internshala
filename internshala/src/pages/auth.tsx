import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Smartphone,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { SubmitEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

import { auth } from "@/firebase/firebase";
import {
  getBrowserLanguage,
  getSavedLanguagePreference,
} from "@/i18n/languageStorage";

const API_URL = "https://internshala-78tb.onrender.com";

type AuthMode = "login" | "signup";

type FormData = {
  name: string;
  email: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
};

const initialFormData: FormData = {
  name: "",
  email: "",
  phoneNumber: "",
  password: "",
  confirmPassword: "",
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

export default function AuthPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>("login");

  const [formData, setFormData] = useState<FormData>(initialFormData);

  const [showPassword, setShowPassword] = useState(false);

  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const requestedMode = router.query.mode;

    if (requestedMode === "signup" || requestedMode === "login") {
      setMode(requestedMode);
    }
  }, [router.isReady, router.query.mode]);

  const handleModeChange = (newMode: AuthMode) => {
    setMode(newMode);
    setError("");
    setShowPassword(false);
    setShowConfirmPassword(false);

    setFormData(initialFormData);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  };

  const getInitialLanguage = () => {
    const savedLanguage = getSavedLanguagePreference();

    const candidateLanguage = savedLanguage || getBrowserLanguage();

    return candidateLanguage === "fr" ? "en" : candidateLanguage;
  };

  const syncMongoUser = async (
    firebaseUser: FirebaseUser,
    phoneNumber?: string,
  ) => {
    const idToken = await firebaseUser.getIdToken(true);

    const normalizedPhone = phoneNumber
      ? normalizePhoneNumber(phoneNumber)
      : "";

    const response = await fetch(`${API_URL}/api/user/sync`, {
      method: "POST",

      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        preferredLanguage: getInitialLanguage(),

        ...(normalizedPhone
          ? {
              phoneNumber: normalizedPhone,
            }
          : {}),
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const syncError = new Error(data.error || "USER_SYNC_FAILED");

      (
        syncError as Error & {
          code?: string;
        }
      ).code = data.error || "USER_SYNC_FAILED";

      throw syncError;
    }

    return data.user;
  };

  const getFirebaseErrorMessage = (authError: any, currentMode: AuthMode) => {
    if (authError?.code === "PHONE_NUMBER_ALREADY_IN_USE") {
      return t("authPage.errors.phoneAlreadyInUse");
    }

    switch (authError?.code) {
      case "auth/invalid-email":
        return t("authPage.errors.invalidEmail");

      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return t("authPage.errors.invalidCredentials");

      case "auth/email-already-in-use":
        return t("authPage.errors.emailAlreadyInUse");

      case "auth/weak-password":
        return t("authPage.errors.weakPassword");

      case "auth/too-many-requests":
        return t("authPage.errors.tooManyRequests");

      case "auth/network-request-failed":
        return t("authPage.errors.networkError");

      case "auth/user-disabled":
        return t("authPage.errors.userDisabled");

      case "auth/operation-not-allowed":
        return t("authPage.errors.emailPasswordDisabled");

      default:
        return currentMode === "login"
          ? t("authPage.errors.loginFailed")
          : t("authPage.errors.signupFailed");
    }
  };

  const validateLogin = () => {
    const email = formData.email.trim();

    if (!email || !formData.password) {
      setError(t("authPage.errors.loginRequired"));

      return false;
    }

    if (!isValidEmail(email)) {
      setError(t("authPage.errors.invalidEmail"));

      return false;
    }

    return true;
  };

  const validateSignup = () => {
    const name = formData.name.trim();

    const email = formData.email.trim();

    const phoneNumber = formData.phoneNumber.trim();

    if (!name || !email || !formData.password || !formData.confirmPassword) {
      setError(t("authPage.errors.signupRequired"));

      return false;
    }

    if (!isValidEmail(email)) {
      setError(t("authPage.errors.invalidEmail"));

      return false;
    }

    if (phoneNumber && !isValidPhoneNumber(phoneNumber)) {
      setError(t("authPage.errors.invalidPhone"));

      return false;
    }

    if (formData.password.length < 8) {
      setError(t("authPage.errors.passwordLength"));

      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError(t("authPage.errors.passwordMismatch"));

      return false;
    }

    return true;
  };

  const handleLogin = async () => {
    if (!validateLogin()) {
      return;
    }

    let authenticated = false;

    try {
      setLoading(true);
      setError("");

      const credential = await signInWithEmailAndPassword(
        auth,
        formData.email.trim(),
        formData.password,
      );

      authenticated = true;

      const mongoUser = await syncMongoUser(credential.user);

      toast.success(t("authPage.loginSuccess"));

      if (mongoUser?.mustChangePassword) {
        await router.replace("/change-password");

        return;
      }

      await router.replace("/");
    } catch (authError: any) {
      console.error("Email login failed:", authError);

      if (authenticated) {
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error(
            "Failed to sign out after profile sync failure:",
            signOutError,
          );
        }

        setError(t("authPage.errors.profileSyncFailed"));

        return;
      }

      setError(getFirebaseErrorMessage(authError, "login"));
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!validateSignup()) {
      return;
    }

    let firebaseAccountCreated = false;

    try {
      setLoading(true);
      setError("");

      const credential = await createUserWithEmailAndPassword(
        auth,
        formData.email.trim(),
        formData.password,
      );

      firebaseAccountCreated = true;

      await updateProfile(credential.user, {
        displayName: formData.name.trim(),
      });

      await credential.user.reload();

      const mongoUser = await syncMongoUser(
        credential.user,
        formData.phoneNumber,
      );

      toast.success(t("authPage.signupSuccess"));

      if (mongoUser?.mustChangePassword) {
        await router.replace("/change-password");

        return;
      }

      await router.replace("/");
    } catch (authError: any) {
      console.error("Email signup failed:", authError);

      if (authError?.code === "PHONE_NUMBER_ALREADY_IN_USE") {
        if (firebaseAccountCreated) {
          try {
            await signOut(auth);
          } catch (signOutError) {
            console.error(
              "Failed to sign out after duplicate phone number:",
              signOutError,
            );
          }
        }

        setError(t("authPage.errors.phoneAlreadyInUse"));

        return;
      }

      if (
        firebaseAccountCreated &&
        (authError?.code === "USER_SYNC_FAILED" ||
          authError?.message === "USER_SYNC_FAILED")
      ) {
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error(
            "Failed to sign out after profile sync failure:",
            signOutError,
          );
        }

        setError(t("authPage.errors.signupProfileSyncFailed"));

        return;
      }

      setError(getFirebaseErrorMessage(authError, "signup"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    if (mode === "login") {
      await handleLogin();
      return;
    }

    await handleSignup();
  };

  return (
    <main className="min-h-[calc(100vh-8rem)] bg-gray-50 px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-blue-600"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("authPage.backHome")}
        </Link>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
          <div className="px-6 pb-5 pt-7 text-center sm:px-8">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
              <LockKeyhole className="h-6 w-6" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900">
              {t("authPage.title")}
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              {t("authPage.description")}
            </p>
          </div>

          <div className="mx-6 grid grid-cols-2 rounded-xl bg-gray-100 p-1 sm:mx-8">
            <button
              type="button"
              onClick={() => handleModeChange("login")}
              disabled={loading}
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                mode === "login"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {t("authPage.loginTab")}
            </button>

            <button
              type="button"
              onClick={() => handleModeChange("signup")}
              disabled={loading}
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                mode === "signup"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {t("authPage.signupTab")}
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-5 px-6 pb-8 pt-6 sm:px-8"
          >
            {mode === "signup" && (
              <div>
                <label
                  htmlFor="name"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  {t("authPage.fullName")}
                </label>

                <div className="relative">
                  <UserRound className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={formData.name}
                    onChange={handleChange}
                    disabled={loading}
                    placeholder={t("authPage.fullNamePlaceholder")}
                    className="w-full rounded-lg border border-gray-300 py-3 pl-11 pr-4 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                {t("authPage.email")}
              </label>

              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder={t("authPage.emailPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 py-3 pl-11 pr-4 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
              </div>
            </div>

            {mode === "signup" && (
              <div>
                <label
                  htmlFor="phoneNumber"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  {t("authPage.phoneNumber")}
                  <span className="ml-1 font-normal text-gray-400">
                    {t("authPage.optional")}
                  </span>
                </label>

                <div className="relative">
                  <Smartphone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

                  <input
                    id="phoneNumber"
                    name="phoneNumber"
                    type="tel"
                    autoComplete="tel"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    disabled={loading}
                    placeholder={t("authPage.phonePlaceholder")}
                    className="w-full rounded-lg border border-gray-300 py-3 pl-11 pr-4 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                  />
                </div>

                <p className="mt-2 text-xs leading-5 text-gray-500">
                  {t("authPage.phoneHint")}
                </p>
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  {t("authPage.password")}
                </label>

                {mode === "login" && (
                  <Link
                    href="/forgot-password"
                    className="text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    {t("authPage.forgotPassword")}
                  </Link>
                )}
              </div>

              <div className="relative">
                <LockKeyhole className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={formData.password}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder={t("authPage.passwordPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 py-3 pl-11 pr-11 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((previous) => !previous)}
                  disabled={loading}
                  aria-label={
                    showPassword
                      ? t("authPage.hidePassword")
                      : t("authPage.showPassword")
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-700"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>

              {mode === "signup" && (
                <p className="mt-2 text-xs text-gray-500">
                  {t("authPage.passwordHint")}
                </p>
              )}
            </div>

            {mode === "signup" && (
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  {t("authPage.confirmPassword")}
                </label>

                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    disabled={loading}
                    placeholder={t("authPage.confirmPasswordPlaceholder")}
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
                        ? t("authPage.hidePassword")
                        : t("authPage.showPassword")
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
                ? mode === "login"
                  ? t("authPage.loggingIn")
                  : t("authPage.creatingAccount")
                : mode === "login"
                  ? t("authPage.loginButton")
                  : t("authPage.signupButton")}
            </button>

            <p className="text-center text-xs leading-5 text-gray-500">
              {mode === "login"
                ? t("authPage.loginSecurityNote")
                : t("authPage.signupSecurityNote")}
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
