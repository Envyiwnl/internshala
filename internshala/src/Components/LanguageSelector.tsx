import { ChangeEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { auth } from "@/firebase/firebase";
import { toast } from "react-toastify";
import { SUPPORTED_LANGUAGES, SupportedLanguage } from "@/i18n/i18n";
import { saveLanguagePreference } from "@/i18n/languageStorage";
import FrenchOtpModal from "./FrenchOtpModal";

export default function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const [isFrenchOtpOpen, setIsFrenchOtpOpen] = useState(false);

  const handleLanguageChange = async (
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    const selectedLanguage = event.target.value as SupportedLanguage;

    if (selectedLanguage === "fr") {
      try {
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
            toast.info(
              `Please wait ${data.retryAfter} seconds before requesting another OTP.`,
            );
            return;
          }

          throw new Error(data.error || "OTP request failed");
        }

        toast.success(t("language.otpSent"));
        setIsFrenchOtpOpen(true);
      } catch (error) {
        console.error("French OTP request failed:", error);

        toast.error(t("language.otpSendFailed"));
      }

      return;
    }

    try {
      const currentUser = auth.currentUser;

      if (currentUser) {
        const idToken = await currentUser.getIdToken();

        const response = await fetch(
          "https://internshala-78tb.onrender.com/api/language",
          {
            method: "PUT",

            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json",
            },

            body: JSON.stringify({
              language: selectedLanguage,
            }),
          },
        );

        if (!response.ok) {
          throw new Error("Language update failed");
        }

        const data = await response.json();

        await i18n.changeLanguage(data.preferredLanguage);

        saveLanguagePreference(data.preferredLanguage);

        document.documentElement.lang = data.preferredLanguage;

        return;
      }

      await i18n.changeLanguage(selectedLanguage);

      saveLanguagePreference(selectedLanguage);

      document.documentElement.lang = selectedLanguage;
    } catch (error) {
      console.error("Language change failed:", error);

      toast.error(t("language.changeFailed"));
    }
  };

  const handleFrenchVerified = async () => {
    await i18n.changeLanguage("fr");

    saveLanguagePreference("fr");

    document.documentElement.lang = "fr";
  };

  return (
    <>
      <select
        value={i18n.resolvedLanguage || i18n.language}
        onChange={handleLanguageChange}
        aria-label={t("language.selectLanguage")}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      <FrenchOtpModal
        isOpen={isFrenchOtpOpen}
        onClose={() => setIsFrenchOtpOpen(false)}
        onVerified={handleFrenchVerified}
      />
    </>
  );
}
