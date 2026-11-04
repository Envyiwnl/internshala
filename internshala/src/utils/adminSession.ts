const ADMIN_SESSION_KEY = "internshala_admin_session";

const ADMIN_SESSION_EXPIRY_KEY = "internshala_admin_session_expiry";

export const setAdminSession = (token: string, expiresAt: string) => {
  sessionStorage.setItem(ADMIN_SESSION_KEY, token);

  sessionStorage.setItem(ADMIN_SESSION_EXPIRY_KEY, expiresAt);
};

export const getAdminSessionToken = () => {
  const token = sessionStorage.getItem(ADMIN_SESSION_KEY);

  const expiresAt = sessionStorage.getItem(ADMIN_SESSION_EXPIRY_KEY);

  if (!token || !expiresAt) {
    clearAdminSession();
    return null;
  }

  const expiryTime = new Date(expiresAt).getTime();

  if (!Number.isFinite(expiryTime) || expiryTime <= Date.now()) {
    clearAdminSession();
    return null;
  }

  return token;
};

export const clearAdminSession = () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);

  sessionStorage.removeItem(ADMIN_SESSION_EXPIRY_KEY);
};
