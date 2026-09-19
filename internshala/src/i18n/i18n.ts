import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import es from "./locales/es.json";
import hi from "./locales/hi.json";
import pt from "./locales/pt.json";
import zh from "./locales/zh.json";
import fr from "./locales/fr.json";

export const SUPPORTED_LANGUAGES = {
  en: "English",
  es: "Español",
  hi: "हिन्दी",
  pt: "Português",
  zh: "中文",
  fr: "Français",
} as const;

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES;

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: en,
    },
    es: {
      translation: es,
    },
    hi: {
      translation: hi,
    },
    pt: {
      translation: pt,
    },
    zh: {
      translation: zh,
    },
    fr: {
      translation: fr,
    },
  },

  lng: "en",

  fallbackLng: "en",

  supportedLngs: Object.keys(SUPPORTED_LANGUAGES),

  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
