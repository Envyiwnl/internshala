const LOGIN_SESSION_STORAGE_KEY = "internshala_login_session";

const LOGIN_CHALLENGE_STORAGE_KEY = "internshala_login_challenge";

export type StoredLoginSession = {
  token: string;
  activityId: string;
  expiresAt: string;
};

export type StoredLoginChallenge = {
  token: string;
  activityId: string;
  destination: string;
  otpExpiresAt: string;
  challengeExpiresAt: string;
  resendAvailableAt: string;

  resendCount?: number;
  resendLimit?: number;

  mustChangePassword?: boolean;
  redirectPath?: string;

  authMode?: "login" | "signup";
};

const isBrowser = () => {
  return typeof window !== "undefined";
};

const isExpired = (dateValue: string | null | undefined) => {
  if (!dateValue) {
    return true;
  }

  const timestamp = new Date(dateValue).getTime();

  if (Number.isNaN(timestamp)) {
    return true;
  }

  return timestamp <= Date.now();
};

export const saveLoginSession = (session: StoredLoginSession) => {
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.setItem(
    LOGIN_SESSION_STORAGE_KEY,
    JSON.stringify(session),
  );
};

export const getLoginSession = (): StoredLoginSession | null => {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.sessionStorage.getItem(LOGIN_SESSION_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as StoredLoginSession;

    if (
      !session.token ||
      !session.activityId ||
      !session.expiresAt ||
      isExpired(session.expiresAt)
    ) {
      clearLoginSession();

      return null;
    }

    return session;
  } catch {
    clearLoginSession();

    return null;
  }
};

export const getLoginSessionToken = () => {
  return getLoginSession()?.token || "";
};

export const clearLoginSession = () => {
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.removeItem(LOGIN_SESSION_STORAGE_KEY);
};

export const saveLoginChallenge = (challenge: StoredLoginChallenge) => {
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.setItem(
    LOGIN_CHALLENGE_STORAGE_KEY,
    JSON.stringify(challenge),
  );
};

export const getLoginChallenge = (): StoredLoginChallenge | null => {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.sessionStorage.getItem(LOGIN_CHALLENGE_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const challenge = JSON.parse(raw) as StoredLoginChallenge;

    if (
      !challenge.token ||
      !challenge.activityId ||
      !challenge.challengeExpiresAt ||
      isExpired(challenge.challengeExpiresAt)
    ) {
      clearLoginChallenge();

      return null;
    }

    return challenge;
  } catch {
    clearLoginChallenge();

    return null;
  }
};

export const clearLoginChallenge = () => {
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.removeItem(LOGIN_CHALLENGE_STORAGE_KEY);
};

export const getLoginSessionHeader = () => {
  const token = getLoginSessionToken();

  if (!token) {
    return {};
  }

  return {
    "X-Login-Session": token,
  };
};

export const clearLoginSecurityStorage = () => {
  clearLoginSession();
  clearLoginChallenge();
};
