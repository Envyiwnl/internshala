const axios = require("axios");

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";

const TARGET_LANGUAGES = {
  es: "es",
  hi: "hi",
  pt: "pt",
  zh: "zh-CN",
  fr: "fr",
};

const MAX_CHUNK_BYTES = 450;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getByteLength = (text) => Buffer.byteLength(text, "utf8");

const splitTextIntoChunks = (text, maxBytes = MAX_CHUNK_BYTES) => {
  if (!text) {
    return [];
  }

  if (getByteLength(text) <= maxBytes) {
    return [text];
  }

  const words = text.split(/\s+/);

  const chunks = [];
  let currentChunk = "";

  for (const word of words) {
    const candidate = currentChunk ? `${currentChunk} ${word}` : word;

    if (getByteLength(candidate) <= maxBytes) {
      currentChunk = candidate;
      continue;
    }

    if (currentChunk) {
      chunks.push(currentChunk);
      currentChunk = "";
    }

    if (getByteLength(word) > maxBytes) {
      let partial = "";

      for (const char of word) {
        const candidatePartial = partial + char;

        if (getByteLength(candidatePartial) > maxBytes) {
          chunks.push(partial);
          partial = char;
        } else {
          partial = candidatePartial;
        }
      }

      if (partial) {
        currentChunk = partial;
      }
    } else {
      currentChunk = word;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
};

const decodeHtmlEntities = (text) => {
  if (!text) {
    return text;
  }

  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    );
};

const translateChunk = async (text, targetLanguage) => {
  const params = {
    q: text,
    langpair: `en|${targetLanguage}`,
  };

  if (process.env.MYMEMORY_EMAIL) {
    params.de = process.env.MYMEMORY_EMAIL;
  }

  let lastError;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await axios.get(MYMEMORY_URL, {
        params,
        timeout: 10000,
      });

      const translatedText = response.data?.responseData?.translatedText;

      const responseStatus = Number(response.data?.responseStatus);

      if (responseStatus && responseStatus !== 200) {
        throw new Error(
          `Translation provider returned status ${responseStatus}`,
        );
      }

      if (!translatedText) {
        throw new Error("Translation provider returned no translated text");
      }

      return decodeHtmlEntities(translatedText);
    } catch (error) {
      lastError = error;

      if (attempt < 2) {
        await delay(500);
      }
    }
  }

  throw lastError;
};

const translateText = async (text, targetLanguage) => {
  if (typeof text !== "string" || !text.trim()) {
    return text;
  }

  const chunks = splitTextIntoChunks(text);

  const translatedChunks = [];

  for (const chunk of chunks) {
    const translated = await translateChunk(chunk, targetLanguage);

    translatedChunks.push(translated.trim());
  }

  return translatedChunks.join(" ");
};

const translateArray = async (values, targetLanguage) => {
  if (!Array.isArray(values)) {
    return values;
  }

  const translatedValues = [];

  for (const value of values) {
    if (typeof value !== "string") {
      translatedValues.push(value);
      continue;
    }

    translatedValues.push(await translateText(value, targetLanguage));
  }

  return translatedValues;
};

const translateInternshipToLanguage = async (data, targetLanguage) => {
  return {
    title: await translateText(data.title, targetLanguage),

    category: await translateText(data.category, targetLanguage),

    aboutCompany: await translateText(data.aboutCompany, targetLanguage),

    aboutInternship: await translateText(data.aboutInternship, targetLanguage),

    whoCanApply: await translateText(data.whoCanApply, targetLanguage),

    perks: await translateArray(data.perks, targetLanguage),

    duration: await translateText(data.duration, targetLanguage),

    additionalInfo: await translateText(data.additionalInfo, targetLanguage),
  };
};

const translateJobToLanguage = async (data, targetLanguage) => {
  return {
    title: await translateText(data.title, targetLanguage),

    Experience: await translateText(data.Experience, targetLanguage),

    category: await translateText(data.category, targetLanguage),

    aboutCompany: await translateText(data.aboutCompany, targetLanguage),

    aboutJob: await translateText(data.aboutJob, targetLanguage),

    whoCanApply: await translateText(data.whoCanApply, targetLanguage),

    perks: await translateArray(data.perks, targetLanguage),

    AdditionalInfo: await translateText(data.AdditionalInfo, targetLanguage),
  };
};

const translateForAllLanguages = async (data, translationFunction) => {
  const languageEntries = Object.entries(TARGET_LANGUAGES);

  const results = await Promise.allSettled(
    languageEntries.map(async ([storageKey, providerLanguage]) => {
      const translation = await translationFunction(data, providerLanguage);

      return {
        storageKey,
        translation,
      };
    }),
  );

  const translations = {};

  results.forEach((result, index) => {
    const [storageKey] = languageEntries[index];

    if (result.status === "fulfilled") {
      translations[storageKey] = result.value.translation;
    } else {
      console.error(`Translation failed for ${storageKey}:`, result.reason);
    }
  });

  return translations;
};

const translateInternshipContent = async (internshipData) => {
  return translateForAllLanguages(
    internshipData,
    translateInternshipToLanguage,
  );
};

const translateJobContent = async (jobData) => {
  return translateForAllLanguages(jobData, translateJobToLanguage);
};

module.exports = {
  translateInternshipContent,
  translateJobContent,
};
