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
import { Provider, useDispatch } from "react-redux";
import { useEffect } from "react";
import { auth } from "@/firebase/firebase";
import { login, logout } from "@/feature/userSlice";
import { ToastContainer } from "react-toastify";

export default function App({ Component, pageProps }: AppProps) {
  function AuthListener() {
    const dispatch = useDispatch();

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

          const response = await fetch(
            "https://internshala-78tb.onrender.com/api/user/sync",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${idToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                preferredLanguage: initialLanguage,
              }),
            },
          );

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
              name: authUser.displayName,
              email: authUser.email,
              phoneNumber: authUser.phoneNumber,

              preferredLanguage: data.user.preferredLanguage,
            }),
          );
        } catch (error) {
          console.error("User sync failed:", error);

          dispatch(
            login({
              uid: authUser.uid,
              photo: authUser.photoURL,
              name: authUser.displayName,
              email: authUser.email,
              phoneNumber: authUser.phoneNumber,
            }),
          );
        }
      });

      return () => unsubscribe();
    }, [dispatch]);

    return null;
  }

  return (
    <Provider store={store}>
      <AuthListener />
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
