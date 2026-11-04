import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  ArrowLeft,
  Clock3,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { SubmitEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

import { auth, provider } from "@/firebase/firebase";
import {
  getBrowserLanguage,
  getSavedLanguagePreference,
} from "@/i18n/languageStorage";

import {
  clearLoginChallenge,
  clearLoginSecurityStorage,
  getLoginChallenge,
  saveLoginChallenge,
  saveLoginSession,
} from "@/utils/loginSession";

const API_URL = "https://internshala-78tb.onrender.com";

type AuthMode = "login" | "signup";

type AuthStage = "credentials" | "otp";

type LoginSecurityResponse = {
  error?: string;
  message?: string;

  requiresOtp?: boolean;

  challengeToken?: string;
  activityId?: string;
  destination?: string;

  otpExpiresAt?: string;
  challengeExpiresAt?: string;
  resendAvailableAt?: string;

  resendCount?: number;
  resendLimit?: number;

  attemptsRemaining?: number;

  sessionToken?: string;
  sessionExpiresAt?: string;

  isNewBrowser?: boolean;
  isNewDevice?: boolean;
  isNewIp?: boolean;
};

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

export default function AuthPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>("login");

  const [formData, setFormData] = useState<FormData>(initialFormData);

  const [showPassword, setShowPassword] = useState(false);

  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [stage, setStage] = useState<AuthStage>("credentials");

  const [loginOtp, setLoginOtp] = useState("");

  const [loginChallengeToken, setLoginChallengeToken] = useState("");

  const [loginOtpDestination, setLoginOtpDestination] = useState("");

  const [loginOtpExpiresAt, setLoginOtpExpiresAt] = useState<string | null>(
    null,
  );

  const [loginChallengeExpiresAt, setLoginChallengeExpiresAt] = useState<
    string | null
  >(null);

  const [loginOtpResendAvailableAt, setLoginOtpResendAvailableAt] = useState<
    string | null
  >(null);

  const [loginOtpResendCount, setLoginOtpResendCount] = useState(0);

  const [loginOtpResendLimit, setLoginOtpResendLimit] = useState(3);

  const [loginOtpAttemptsRemaining, setLoginOtpAttemptsRemaining] = useState(5);

  const [pendingMustChangePassword, setPendingMustChangePassword] =
    useState(false);

  const [pendingRedirectPath, setPendingRedirectPath] = useState("/");

  const [pendingAuthMode, setPendingAuthMode] = useState<AuthMode>("login");

  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const requestedMode = router.query.mode;

    if (requestedMode === "signup" || requestedMode === "login") {
      setMode(requestedMode);
    }
  }, [router.isReady, router.query.mode]);

  useEffect(() => {
    let active = true;

    const restoreChallenge = async () => {
      try {
        await auth.authStateReady();

        if (!active) {
          return;
        }

        const storedChallenge = getLoginChallenge();

        if (!storedChallenge) {
          return;
        }

        if (!auth.currentUser) {
          clearLoginChallenge();

          return;
        }

        setLoginChallengeToken(storedChallenge.token);

        setLoginOtpDestination(storedChallenge.destination);

        setLoginOtpExpiresAt(storedChallenge.otpExpiresAt);

        setLoginChallengeExpiresAt(storedChallenge.challengeExpiresAt);

        setLoginOtpResendAvailableAt(storedChallenge.resendAvailableAt);

        setLoginOtpResendCount(storedChallenge.resendCount || 0);

        setLoginOtpResendLimit(storedChallenge.resendLimit || 3);

        setPendingMustChangePassword(
          Boolean(storedChallenge.mustChangePassword),
        );

        setPendingRedirectPath(storedChallenge.redirectPath || "/");

        setPendingAuthMode(storedChallenge.authMode || "login");

        setLoginOtp("");

        setStage("otp");

        setCurrentTime(Date.now());
      } catch (restoreError) {
        console.error("Login challenge restore failed:", restoreError);

        clearLoginChallenge();
      }
    };

    restoreChallenge();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (stage !== "otp") {
      return;
    }

    const interval = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [stage]);

  const otpSecondsRemaining = getSecondsRemaining(
    loginOtpExpiresAt,
    currentTime,
  );

  const resendSecondsRemaining = getSecondsRemaining(
    loginOtpResendAvailableAt,
    currentTime,
  );

  const challengeSecondsRemaining = getSecondsRemaining(
    loginChallengeExpiresAt,
    currentTime,
  );

  const loginOtpExpired = otpSecondsRemaining <= 0;

  const loginChallengeExpired = challengeSecondsRemaining <= 0;

  const getRedirectPath = () => {
    const redirect = router.query.redirect;

    if (
      typeof redirect === "string" &&
      redirect.startsWith("/") &&
      !redirect.startsWith("//")
    ) {
      return redirect;
    }

    return "/";
  };

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

  const startLoginSecurity = async ({
    firebaseUser,
    mustChangePassword,
    authMode,
  }: {
    firebaseUser: FirebaseUser;
    mustChangePassword: boolean;
    authMode: AuthMode;
  }) => {
    const idToken = await firebaseUser.getIdToken(true);

    const response = await fetch(`${API_URL}/api/login-security/start`, {
      method: "POST",

      headers: {
        Authorization: `Bearer ${idToken}`,

        "Content-Type": "application/json",
      },
    });

    const data: LoginSecurityResponse = await response.json().catch(() => ({}));

    if (response.status === 202 && data.requiresOtp) {
      if (
        !data.challengeToken ||
        !data.activityId ||
        !data.otpExpiresAt ||
        !data.challengeExpiresAt ||
        !data.resendAvailableAt
      ) {
        throw {
          loginSecurity: true,
          code: "LOGIN_SECURITY_START_FAILED",
          data,
        };
      }

      const redirectPath = getRedirectPath();

      const destination = data.destination || "";

      saveLoginChallenge({
        token: data.challengeToken,

        activityId: data.activityId,

        destination,

        otpExpiresAt: data.otpExpiresAt,

        challengeExpiresAt: data.challengeExpiresAt,

        resendAvailableAt: data.resendAvailableAt,

        resendCount: data.resendCount || 0,

        resendLimit: data.resendLimit || 3,

        mustChangePassword,

        redirectPath,

        authMode,
      });

      setLoginChallengeToken(data.challengeToken);

      setLoginOtpDestination(destination);

      setLoginOtpExpiresAt(data.otpExpiresAt);

      setLoginChallengeExpiresAt(data.challengeExpiresAt);

      setLoginOtpResendAvailableAt(data.resendAvailableAt);

      setLoginOtpResendCount(data.resendCount || 0);

      setLoginOtpResendLimit(data.resendLimit || 3);

      setLoginOtpAttemptsRemaining(5);

      setPendingMustChangePassword(mustChangePassword);

      setPendingRedirectPath(redirectPath);

      setPendingAuthMode(authMode);

      setLoginOtp("");

      setCurrentTime(Date.now());

      setStage("otp");

      return {
        pendingOtp: true,
      };
    }

    if (!response.ok) {
      throw {
        loginSecurity: true,
        code: data.error || "LOGIN_SECURITY_START_FAILED",
        data,
      };
    }

    if (!data.sessionToken || !data.activityId || !data.sessionExpiresAt) {
      throw {
        loginSecurity: true,
        code: "LOGIN_SECURITY_START_FAILED",
        data,
      };
    }

    saveLoginSession({
      token: data.sessionToken,

      activityId: data.activityId,

      expiresAt: data.sessionExpiresAt,
    });

    clearLoginChallenge();

    return {
      pendingOtp: false,
    };
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

  const getLoginSecurityErrorMessage = (
    errorCode?: string,
    data?: LoginSecurityResponse,
  ) => {
    switch (errorCode) {
      case "MOBILE_LOGIN_OUTSIDE_ALLOWED_HOURS":
        return t("authPage.errors.mobileLoginOutsideHours");

      case "LOGIN_EMAIL_NOT_AVAILABLE":
        return t("authPage.errors.loginEmailUnavailable");

      case "LOGIN_OTP_DELIVERY_FAILED":
        return t("authPage.errors.loginOtpDeliveryFailed");

      case "LOGIN_CHALLENGE_NOT_FOUND":
      case "LOGIN_CHALLENGE_CLOSED":
        return t("authPage.errors.loginChallengeClosed");

      case "LOGIN_CHALLENGE_ALREADY_USED":
        return t("authPage.errors.loginChallengeAlreadyUsed");

      case "LOGIN_CHALLENGE_EXPIRED":
        return t("authPage.errors.loginChallengeExpired");

      case "INVALID_OTP_FORMAT":
        return t("authPage.errors.invalidLoginOtpFormat");

      case "INVALID_LOGIN_OTP":
        if (typeof data?.attemptsRemaining === "number") {
          return t("authPage.errors.invalidLoginOtpWithAttempts", {
            count: data.attemptsRemaining,
          });
        }

        return t("authPage.errors.invalidLoginOtp");

      case "LOGIN_OTP_EXPIRED":
        return t("authPage.errors.loginOtpExpired");

      case "LOGIN_OTP_ATTEMPTS_EXCEEDED":
        return t("authPage.errors.loginOtpAttemptsExceeded");

      case "LOGIN_OTP_RESEND_COOLDOWN":
        return t("authPage.errors.loginOtpResendCooldown");

      case "LOGIN_OTP_RESEND_LIMIT_REACHED":
        return t("authPage.errors.loginOtpResendLimit");

      case "LOGIN_OTP_RESEND_CONFLICT":
      case "LOGIN_OTP_RESEND_FAILED":
        return t("authPage.errors.loginOtpResendFailed");

      case "LOGIN_OTP_VERIFICATION_CONFLICT":
      case "LOGIN_OTP_VERIFICATION_FAILED":
        return t("authPage.errors.loginOtpVerificationFailed");

      case "LOGIN_SECURITY_START_FAILED":
        return t("authPage.errors.loginSecurityFailed");

      default:
        return t("authPage.errors.loginSecurityFailed");
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

  const handleGoogleLogin = async () => {
    let authenticated = false;

    try {
      setLoading(true);
      setError("");

      clearLoginSecurityStorage();

      const credential = await signInWithPopup(auth, provider);

      authenticated = true;

      const googleAuthMode: AuthMode = getAdditionalUserInfo(credential)
        ?.isNewUser
        ? "signup"
        : "login";

      const mongoUser = await syncMongoUser(credential.user);

      const securityResult = await startLoginSecurity({
        firebaseUser: credential.user,

        mustChangePassword: Boolean(mongoUser?.mustChangePassword),

        authMode: googleAuthMode,
      });

      if (securityResult.pendingOtp) {
        return;
      }

      toast.success(
        googleAuthMode === "signup"
          ? t("authPage.signupSuccess")
          : t("authPage.loginSuccess"),
      );

      if (mongoUser?.mustChangePassword) {
        await router.replace("/change-password");

        return;
      }

      await router.replace(getRedirectPath());
    } catch (authError: any) {
      console.error("Google authentication failed:", authError);

      if (authError?.code === "auth/popup-closed-by-user") {
        return;
      }

      if (authError?.loginSecurity) {
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error(
            "Failed to sign out after Google login security rejection:",
            signOutError,
          );
        }

        clearLoginSecurityStorage();

        setStage("credentials");

        setError(getLoginSecurityErrorMessage(authError.code, authError.data));

        return;
      }

      if (authenticated) {
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error(
            "Failed to sign out after Google profile sync failure:",
            signOutError,
          );
        }

        clearLoginSecurityStorage();

        setError(t("authPage.errors.profileSyncFailed"));

        return;
      }

      setError(getFirebaseErrorMessage(authError, "login"));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!validateLogin()) {
      return;
    }

    let authenticated = false;

    try {
      setLoading(true);
      setError("");

      clearLoginSecurityStorage();

      const credential = await signInWithEmailAndPassword(
        auth,
        formData.email.trim(),
        formData.password,
      );

      authenticated = true;

      const mongoUser = await syncMongoUser(credential.user);

      const securityResult = await startLoginSecurity({
        firebaseUser: credential.user,

        mustChangePassword: Boolean(mongoUser?.mustChangePassword),

        authMode: "login",
      });

      if (securityResult.pendingOtp) {
        return;
      }

      toast.success(t("authPage.loginSuccess"));

      if (mongoUser?.mustChangePassword) {
        await router.replace("/change-password");

        return;
      }

      await router.replace(getRedirectPath());
    } catch (authError: any) {
      console.error("Email login failed:", authError);

      if (authError?.loginSecurity) {
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error(
            "Failed to sign out after login security rejection:",
            signOutError,
          );
        }

        clearLoginSecurityStorage();

        setStage("credentials");

        setError(getLoginSecurityErrorMessage(authError.code, authError.data));

        return;
      }

      if (authenticated) {
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error(
            "Failed to sign out after profile sync failure:",
            signOutError,
          );
        }

        clearLoginSecurityStorage();

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
      clearLoginSecurityStorage();

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

      const securityResult = await startLoginSecurity({
        firebaseUser: credential.user,

        mustChangePassword: Boolean(mongoUser?.mustChangePassword),

        authMode: "signup",
      });

      if (securityResult.pendingOtp) {
        return;
      }

      toast.success(t("authPage.signupSuccess"));

      if (mongoUser?.mustChangePassword) {
        await router.replace("/change-password");

        return;
      }

      await router.replace(getRedirectPath());
    } catch (authError: any) {
      console.error("Email signup failed:", authError);

      if (authError?.loginSecurity) {
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error(
            "Failed to sign out after signup login-security rejection:",
            signOutError,
          );
        }

        clearLoginSecurityStorage();

        setStage("credentials");

        setError(getLoginSecurityErrorMessage(authError.code, authError.data));

        return;
      }

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

  const handleVerifyLoginOtp = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading || !loginChallengeToken) {
      return;
    }

    if (!/^\d{6}$/.test(loginOtp)) {
      setError(t("authPage.errors.invalidLoginOtpFormat"));

      return;
    }

    if (loginChallengeExpired) {
      setError(t("authPage.errors.loginChallengeExpired"));

      return;
    }

    if (loginOtpExpired) {
      setError(t("authPage.errors.loginOtpExpired"));

      return;
    }

    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      clearLoginSecurityStorage();

      setStage("credentials");

      setError(t("authPage.errors.loginChallengeClosed"));

      return;
    }

    try {
      setLoading(true);
      setError("");

      const idToken = await firebaseUser.getIdToken(true);

      const response = await fetch(`${API_URL}/api/login-security/verify-otp`, {
        method: "POST",

        headers: {
          Authorization: `Bearer ${idToken}`,

          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          challengeToken: loginChallengeToken,

          otp: loginOtp,
        }),
      });

      const data: LoginSecurityResponse = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        if (typeof data.attemptsRemaining === "number") {
          setLoginOtpAttemptsRemaining(data.attemptsRemaining);
        }

        const terminalErrors = [
          "LOGIN_CHALLENGE_NOT_FOUND",
          "LOGIN_CHALLENGE_CLOSED",
          "LOGIN_CHALLENGE_ALREADY_USED",
          "LOGIN_CHALLENGE_EXPIRED",
          "LOGIN_OTP_ATTEMPTS_EXCEEDED",
        ];

        setError(getLoginSecurityErrorMessage(data.error, data));

        if (data.error && terminalErrors.includes(data.error)) {
          clearLoginSecurityStorage();

          try {
            await signOut(auth);
          } catch (signOutError) {
            console.error(
              "Failed to sign out after terminal OTP failure:",
              signOutError,
            );
          }

          setStage("credentials");
        }

        return;
      }

      if (!data.sessionToken || !data.activityId || !data.sessionExpiresAt) {
        setError(t("authPage.errors.loginSecurityFailed"));

        return;
      }

      saveLoginSession({
        token: data.sessionToken,

        activityId: data.activityId,

        expiresAt: data.sessionExpiresAt,
      });

      clearLoginChallenge();

      toast.success(
        pendingAuthMode === "signup"
          ? t("authPage.signupSuccess")
          : t("authPage.loginSuccess"),
      );

      if (pendingMustChangePassword) {
        await router.replace("/change-password");

        return;
      }

      await router.replace(pendingRedirectPath);
    } catch (verifyError) {
      console.error("Login OTP verification network failure:", verifyError);

      setError(t("authPage.errors.loginVerificationNetworkError"));
    } finally {
      setLoading(false);
    }
  };

  const handleResendLoginOtp = async () => {
    if (
      loading ||
      !loginChallengeToken ||
      resendSecondsRemaining > 0 ||
      loginChallengeExpired ||
      loginOtpResendCount >= loginOtpResendLimit
    ) {
      return;
    }

    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      clearLoginSecurityStorage();

      setStage("credentials");

      return;
    }

    try {
      setLoading(true);
      setError("");

      const idToken = await firebaseUser.getIdToken(true);

      const response = await fetch(`${API_URL}/api/login-security/resend-otp`, {
        method: "POST",

        headers: {
          Authorization: `Bearer ${idToken}`,

          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          challengeToken: loginChallengeToken,
        }),
      });

      const data: LoginSecurityResponse = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        setError(getLoginSecurityErrorMessage(data.error, data));

        return;
      }

      const newOtpExpiresAt = data.otpExpiresAt || "";

      const newResendAvailableAt = data.resendAvailableAt || "";

      const newResendCount = data.resendCount ?? loginOtpResendCount + 1;

      const newResendLimit = data.resendLimit || loginOtpResendLimit;

      setLoginOtp("");

      setLoginOtpExpiresAt(newOtpExpiresAt);

      setLoginOtpResendAvailableAt(newResendAvailableAt);

      setLoginOtpResendCount(newResendCount);

      setLoginOtpResendLimit(newResendLimit);

      setCurrentTime(Date.now());

      saveLoginChallenge({
        token: loginChallengeToken,

        activityId: getLoginChallenge()?.activityId || "",

        destination: loginOtpDestination,

        otpExpiresAt: newOtpExpiresAt,

        challengeExpiresAt: loginChallengeExpiresAt || "",

        resendAvailableAt: newResendAvailableAt,

        resendCount: newResendCount,

        resendLimit: newResendLimit,

        mustChangePassword: pendingMustChangePassword,

        redirectPath: pendingRedirectPath,

        authMode: pendingAuthMode,
      });

      toast.success(t("authPage.loginOtpResent"));
    } catch (resendError) {
      console.error("Login OTP resend network failure:", resendError);

      setError(t("authPage.errors.loginVerificationNetworkError"));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelLoginOtp = async () => {
    clearLoginSecurityStorage();

    setLoginOtp("");
    setLoginChallengeToken("");
    setStage("credentials");
    setError("");

    try {
      await signOut(auth);
    } catch (signOutError) {
      console.error(
        "Failed to sign out while cancelling login verification:",
        signOutError,
      );
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
              {stage === "otp"
                ? t("authPage.loginOtpTitle")
                : t("authPage.title")}
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              {stage === "otp"
                ? t("authPage.loginOtpDescription", {
                    destination: loginOtpDestination,
                  })
                : t("authPage.description")}
            </p>
          </div>
          {stage === "credentials" && (
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
          )}
          {stage === "credentials" && (
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

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />

                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />

                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />

                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>

                {t("navbar.continueWithGoogle")}
              </button>

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
          )}
          {stage === "otp" && (
            <form
              onSubmit={handleVerifyLoginOtp}
              className="space-y-5 px-6 pb-8 pt-6 sm:px-8"
            >
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />

                  <p className="text-sm leading-6 text-blue-800">
                    {t("authPage.loginOtpSecurityNotice")}
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="loginOtp"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  {t("authPage.loginOtpLabel")}
                </label>

                <input
                  id="loginOtp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={loginOtp}
                  onChange={(event) => {
                    const value = event.target.value.replace(/\D/g, "");

                    setLoginOtp(value.slice(0, 6));

                    if (error) {
                      setError("");
                    }
                  }}
                  disabled={loading}
                  placeholder={t("authPage.loginOtpPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-xl font-semibold tracking-[0.5em] text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <Clock3 className="mx-auto h-4 w-4 text-gray-500" />

                  <p className="mt-1 text-xs text-gray-500">
                    {t("authPage.loginOtpExpires")}
                  </p>

                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {loginOtpExpired
                      ? t("authPage.loginOtpExpiredLabel")
                      : formatCountdown(otpSecondsRemaining)}
                  </p>
                </div>

                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <ShieldCheck className="mx-auto h-4 w-4 text-gray-500" />

                  <p className="mt-1 text-xs text-gray-500">
                    {t("authPage.loginOtpAttempts")}
                  </p>

                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {loginOtpAttemptsRemaining}
                  </p>
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
                disabled={loading || loginChallengeExpired}
                className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                {loading
                  ? t("authPage.verifyingLoginOtp")
                  : t("authPage.verifyLoginOtp")}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResendLoginOtp}
                  disabled={
                    loading ||
                    resendSecondsRemaining > 0 ||
                    loginChallengeExpired ||
                    loginOtpResendCount >= loginOtpResendLimit
                  }
                  className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  <RefreshCw className="h-4 w-4" />

                  {loginOtpResendCount >= loginOtpResendLimit
                    ? t("authPage.loginOtpResendLimitReached")
                    : resendSecondsRemaining > 0
                      ? t("authPage.resendLoginOtpIn", {
                          seconds: resendSecondsRemaining,
                        })
                      : t("authPage.resendLoginOtp")}
                </button>

                <p className="mt-2 text-xs text-gray-400">
                  {t("authPage.loginOtpResendsRemaining", {
                    count: Math.max(
                      0,
                      loginOtpResendLimit - loginOtpResendCount,
                    ),
                  })}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCancelLoginOtp}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                <ArrowLeft className="h-4 w-4" />

                {t("authPage.backToCredentials")}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
