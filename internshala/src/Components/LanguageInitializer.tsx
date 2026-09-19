import { useEffect } from "react";
import i18n from "@/i18n/i18n";
import {
  getBrowserLanguage,
  getSavedLanguagePreference,
} from "@/i18n/languageStorage";

export default function LanguageInitializer() {
  useEffect(() => {
    const savedLanguage = getSavedLanguagePreference();

    const language = savedLanguage || getBrowserLanguage();

    i18n.changeLanguage(language);

    document.documentElement.lang = language;
  }, []);

  return null;
}
