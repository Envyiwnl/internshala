const DEFAULT_BLOCKED_PHRASES = [
  // Sexual solicitation
  "send nudes",
  "send me nudes",
  "send nude photos",
  "send naked pictures",
  "send me naked pictures",
  "show me your body",

  // Sexual exploitation / minors
  "child porn",
  "child pornography",
  "sexual content with minors",

  // Self-harm encouragement
  "kill yourself",
  "go kill yourself",
  "you should kill yourself",
  "go die",
  "you should die",

  // Direct violent threats
  "i will kill you",
  "i'm going to kill you",
  "i will hurt you",
  "i'm going to hurt you",

  // Sexual violence threats
  "i will rape you",
  "i'm going to rape you",

  // Intimate-image abuse / blackmail
  "leak your nudes",
  "leak your private photos",
  "share your private photos",
  "post your nudes",
];

const MAX_URLS_PER_TEXT = 3;
const MAX_REPEATED_CHARACTER_COUNT = 14;
const MAX_REPEATED_WORD_STREAK = 8;

const normalizeModerationText = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const configuredBlockedPhrases = String(process.env.SOCIAL_BLOCKED_TERMS || "")
  .split(",")
  .map((phrase) => normalizeModerationText(phrase))
  .filter(Boolean);

const BLOCKED_PHRASES = [
  ...new Set([
    ...DEFAULT_BLOCKED_PHRASES.map(normalizeModerationText),
    ...configuredBlockedPhrases,
  ]),
];

const containsBlockedPhrase = (normalizedText) => {
  if (!normalizedText) return false;

  const paddedText = ` ${normalizedText} `;

  return BLOCKED_PHRASES.some((phrase) => paddedText.includes(` ${phrase} `));
};

const hasTooManyUrls = (text) => {
  const urls = text.match(/\b(?:https?:\/\/|www\.)[^\s]+/gi) || [];

  return urls.length > MAX_URLS_PER_TEXT;
};

const hasExcessiveRepeatedCharacters = (text) => {
  let previousCharacter = "";
  let repeatCount = 0;

  for (const character of text) {
    if (character === previousCharacter) {
      repeatCount += 1;
    } else {
      previousCharacter = character;
      repeatCount = 1;
    }

    if (repeatCount > MAX_REPEATED_CHARACTER_COUNT) {
      return true;
    }
  }

  return false;
};

const hasRepeatedWordSpam = (normalizedText) => {
  const words = normalizedText.split(" ").filter(Boolean);

  let previousWord = "";
  let streak = 0;

  for (const word of words) {
    if (word === previousWord) {
      streak += 1;
    } else {
      previousWord = word;
      streak = 1;
    }

    if (streak >= MAX_REPEATED_WORD_STREAK) {
      return true;
    }
  }

  return false;
};

const validateSocialContent = (value) => {
  const text = typeof value === "string" ? value : "";

  if (!text.trim()) {
    return {
      valid: true,
    };
  }

  const normalizedText = normalizeModerationText(text);

  if (containsBlockedPhrase(normalizedText)) {
    return {
      valid: false,
      error: "CONTENT_REJECTED",
    };
  }

  if (
    hasTooManyUrls(text) ||
    hasExcessiveRepeatedCharacters(text) ||
    hasRepeatedWordSpam(normalizedText)
  ) {
    return {
      valid: false,
      error: "CONTENT_REJECTED",
    };
  }

  return {
    valid: true,
  };
};

module.exports = {
  validateSocialContent,
};
