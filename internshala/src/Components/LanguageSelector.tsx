import { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { SUPPORTED_LANGUAGES, SupportedLanguage } from "@/i18n/i18n";
import { saveLanguagePreference } from "@/i18n/languageStorage";

export default function LanguageSelector() {
  const { t, i18n } = useTranslation();

  const handleLanguageChange = async (
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    const selectedLanguage = event.target.value as SupportedLanguage;

    if (selectedLanguage === "fr") {
      toast.info(t("language.frenchVerificationRequired"));
      return;
    }

    await i18n.changeLanguage(selectedLanguage);

    saveLanguagePreference(selectedLanguage);

    document.documentElement.lang = selectedLanguage;
  };

  return (
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
  );
}
