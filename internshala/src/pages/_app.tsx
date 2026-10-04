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
import { ToastContainer } from "react-toastify";

const API_URL = "https://internshala-78tb.onrender.com";

function AuthListener() {
  const dispatch = useDispatch();
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (authUser) => {
      if (!authUser) {
        dispatch(logout());
        return;
      }

      try {
        const idToken = await authUser.getIdToken();

        const savedLanguage = getSavedLanguagePreference();

        const candidateLanguage = savedLanguage || getBrowserLanguage();

        const initialLanguage =
          candidateLanguage === "fr" ? "en" : candidateLanguage;

        const response = await fetch(`${API_URL}/api/user/sync`, {
          method: "POST",

          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            preferredLanguage: initialLanguage,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to sync user");
        }

        const data = await response.json();

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
        console.error("User sync failed:", error);

        dispatch(logout());

        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error("Sign out after sync failure failed:", signOutError);
        }

        if (router.pathname !== "/auth") {
          await router.replace("/auth?mode=login");
        }
      }
    });

    return () => unsubscribe();
  }, [dispatch, router]);

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
