import { clearAdminSession, getAdminSessionToken } from "@/utils/adminSession";

export class AdminAuthenticatedFetchError extends Error {
  code: string;

  constructor(code: string) {
    super(code);

    this.name = "AdminAuthenticatedFetchError";

    this.code = code;
  }
}

export const adminAuthenticatedFetch = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
) => {
  const adminSession = getAdminSessionToken();

  if (!adminSession) {
    throw new AdminAuthenticatedFetchError("ADMIN_SESSION_REQUIRED");
  }

  const headers = new Headers(init.headers);

  headers.set("X-Admin-Session", adminSession);

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    const data = await response
      .clone()
      .json()
      .catch(() => ({}));

    if (
      data.error === "ADMIN_SESSION_REQUIRED" ||
      data.error === "INVALID_ADMIN_SESSION"
    ) {
      clearAdminSession();
    }
  }

  return response;
};
