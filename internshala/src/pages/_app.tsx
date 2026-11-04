import Footer from "@/Components/Footer";
import { Navbar } from "@/Components/Navbar";
import "@/styles/globals.css";
import i18n from "@/i18n/i18n";
import {
  getBrowserLanguage,
  getSavedLanguagePreference,
  saveLanguagePreference,
} from "@/i18n/languageStorage";
import LanguageInitializer from "@/Components/LanguageInitializer";
import type { AppProps } from "next/app";
import { store } from "../store/store";
import { Provider, useDispatch, useSelector } from "react-redux";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { auth } from "@/firebase/firebase";
import { signOut } from "firebase/auth";
import { login, logout, selectuser } from "@/feature/userSlice";
import {
  clearLoginSecurityStorage,
  getLoginSession,
} from "@/utils/loginSession";
import { ToastContainer } from "react-toastify";

const API_URL = "https://internshala-78tb.onrender.com";

function AuthListener() {
  const dispatch = useDispatch();
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const unsubscribe = auth.onAuthStateChanged(async (authUser) => {
      if (!active) {
        return;
      }

      if (!authUser) {
        clearLoginSecurityStorage();

        dispatch(logout());

        return;
      }

      /*
       * During Chrome OTP verification
       * Firebase authentication has already
       * succeeded, but our application login
       * session does not exist yet.
       *
       * /auth owns that temporary state, so
       * do not sign the Firebase user out
       * while the OTP screen is active.
       */
      const loginSession = getLoginSession();

      if (!loginSession) {
        dispatch(logout());

        if (router.pathname === "/auth") {
          return;
        }

        clearLoginSecurityStorage();

        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error(
            "Sign out after missing login session failed:",
            signOutError,
          );
        }

        if (active) {
          await router.replace("/auth?mode=login");
        }

        return;
      }

      try {
        const idToken = await authUser.getIdToken();

        /*
         * Do not trust sessionStorage by
         * itself. Confirm the session with
         * the backend so revoked, expired,
         * or forged sessions cannot populate
         * Redux.
         */
        const sessionResponse = await fetch(
          `${API_URL}/api/login-security/session/current`,
          {
            method: "GET",

            headers: {
              Authorization: `Bearer ${idToken}`,

              "X-Login-Session": loginSession.token,
            },
          },
        );

        if (!sessionResponse.ok) {
          throw new Error("LOGIN_SESSION_INVALID");
        }

        const savedLanguage = getSavedLanguagePreference();

        const candidateLanguage = savedLanguage || getBrowserLanguage();

        const initialLanguage =
          candidateLanguage === "fr" ? "en" : candidateLanguage;

        const response = await fetch(`${API_URL}/api/user/sync`, {
          method: "POST",

          headers: {
            Authorization: `Bearer ${idToken}`,

            "Content-Type": "application/json",

            "X-Login-Session": loginSession.token,
          },

          body: JSON.stringify({
            preferredLanguage: initialLanguage,
          }),
        });

        if (!response.ok) {
          throw new Error("USER_SYNC_FAILED");
        }

        const data = await response.json();

        if (!active) {
          return;
        }

        const preferredLanguage = data.user.preferredLanguage;

        await i18n.changeLanguage(preferredLanguage);

        saveLanguagePreference(preferredLanguage);

        document.documentElement.lang = preferredLanguage;

        dispatch(
          login({
            uid: authUser.uid,

            photo: authUser.photoURL,

            name: data.user.name || authUser.displayName || "",

            email: authUser.email,

            phoneNumber: data.user.phoneNumber || authUser.phoneNumber,

            preferredLanguage: data.user.preferredLanguage,

            mustChangePassword: Boolean(data.user.mustChangePassword),
          }),
        );

        if (
          data.user.mustChangePassword &&
          router.pathname !== "/change-password"
        ) {
          await router.replace("/change-password");
        }
      } catch (error) {
        console.error("Authenticated session initialization failed:", error);

        if (!active) {
          return;
        }

        clearLoginSecurityStorage();

        dispatch(logout());

        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error(
            "Sign out after session validation failure failed:",
            signOutError,
          );
        }

        if (active && router.pathname !== "/auth") {
          await router.replace("/auth?mode=login");
        }
      }
    });

    return () => {
      active = false;

      unsubscribe();
    };
  }, [dispatch, router.pathname]);

  return null;
}

function ForcedPasswordChangeGuard() {
  const user = useSelector(selectuser);

  const router = useRouter();

  useEffect(() => {
    if (!user?.mustChangePassword) {
      return;
    }

    if (router.pathname === "/change-password") {
      return;
    }

    router.replace("/change-password");
  }, [user?.mustChangePassword, router, router.pathname]);

  return null;
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Provider store={store}>
      <AuthListener />

      <ForcedPasswordChangeGuard />

      <LanguageInitializer />

      <div className="bg-white">
        <ToastContainer />

        <Navbar />

        <Component {...pageProps} />

        <Footer />
      </div>
    </Provider>
  );
}
