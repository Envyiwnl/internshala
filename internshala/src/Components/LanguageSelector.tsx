import { ChangeEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { auth } from "@/firebase/firebase";
import { toast } from "react-toastify";
import { SUPPORTED_LANGUAGES, SupportedLanguage } from "@/i18n/i18n";
import { saveLanguagePreference } from "@/i18n/languageStorage";
import { authenticatedFetch } from "@/utils/authenticatedFetch";
import { getLoginSessionToken } from "@/utils/loginSession";

import FrenchOtpModal from "./FrenchOtpModal";

const API_URL = "https://internshala-78tb.onrender.com";

export default function LanguageSelector() {
  const { t, i18n } = useTranslation();

  const [isFrenchOtpOpen, setIsFrenchOtpOpen] = useState(false);

  const applyLanguageLocally = async (language: SupportedLanguage) => {
    await i18n.changeLanguage(language);

    saveLanguagePreference(language);

    document.documentElement.lang = language;
  };

  const handleLanguageChange = async (
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    const selectedLanguage = event.target.value as SupportedLanguage;

    const currentUser = auth.currentUser;

    const loginSessionToken = getLoginSessionToken();

    if (selectedLanguage === "fr") {
      if (!currentUser || !loginSessionToken) {
        toast.error(t("language.loginRequired"));

        return;
      }

      try {
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

    if (currentUser && loginSessionToken) {
      try {
        const response = await authenticatedFetch(`${API_URL}/api/language`, {
          method: "PUT",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            language: selectedLanguage,
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "Language update failed");
        }

        await applyLanguageLocally(data.preferredLanguage);

        return;
      } catch (error) {
        console.error("Language change failed:", error);

        toast.error(t("language.changeFailed"));

        return;
      }
    }

    try {
      await applyLanguageLocally(selectedLanguage);
    } catch (error) {
      console.error("Local language change failed:", error);

      toast.error(t("language.changeFailed"));
    }
  };

  const handleFrenchVerified = async () => {
    await applyLanguageLocally("fr");
  };

  return (
    <>
      <select
        value={i18n.resolvedLanguage || i18n.language}
        onChange={handleLanguageChange}
        aria-label={t("language.selectLanguage")}
        className="max-w-[112px] truncate rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:max-w-[150px] lg:max-w-[120px] xl:max-w-none"
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
