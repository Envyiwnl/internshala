import { SUPPORTED_LANGUAGES, SupportedLanguage } from "./i18n";

const LANGUAGE_STORAGE_KEY = "preferredLanguage";

export const isSupportedLanguage = (
  language: string,
): language is SupportedLanguage => {
  return language in SUPPORTED_LANGUAGES;
};

export const saveLanguagePreference = (language: SupportedLanguage) => {
  if (typeof window === "undefined") return;

  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
};

export const getSavedLanguagePreference = (): SupportedLanguage | null => {
  if (typeof window === "undefined") return null;

  const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);

  if (savedLanguage && isSupportedLanguage(savedLanguage)) {
    return savedLanguage;
  }

  return null;
};

export const getBrowserLanguage = (): SupportedLanguage => {
  if (typeof window === "undefined") {
    return "en";
  }

  const browserLanguage = navigator.language.split("-")[0];

  if (isSupportedLanguage(browserLanguage)) {
    return browserLanguage;
  }

  return "en";
};
