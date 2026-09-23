const TRANSLATED_LANGUAGES = ["es", "hi", "pt", "zh", "fr"] as const;

type TranslatedLanguage = (typeof TRANSLATED_LANGUAGES)[number];

type LocalizableContent = {
  translations?: Partial<Record<TranslatedLanguage, Record<string, any>>>;

  [key: string]: any;
};

const normalizeLanguage = (language?: string): string => {
  if (!language) {
    return "en";
  }

  return language.toLowerCase().split("-")[0];
};

const hasTranslationValue = (value: any): boolean => {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string" && !value.trim()) {
    return false;
  }

  if (Array.isArray(value) && value.length === 0) {
    return false;
  }

  return true;
};

export const getLocalizedContent = <T extends LocalizableContent>(
  content: T,
  language?: string,
): T => {
  if (!content) {
    return content;
  }

  const normalizedLanguage = normalizeLanguage(language);

  if (normalizedLanguage === "en") {
    return content;
  }

  if (
    !TRANSLATED_LANGUAGES.includes(normalizedLanguage as TranslatedLanguage)
  ) {
    return content;
  }

  const translation =
    content.translations?.[normalizedLanguage as TranslatedLanguage];

  if (!translation) {
    return content;
  }

  const validTranslations = Object.entries(translation).reduce(
    (result, [key, value]) => {
      if (hasTranslationValue(value)) {
        result[key] = value;
      }

      return result;
    },
    {} as Record<string, any>,
  );

  return {
    ...content,
    ...validTranslations,
  };
};
