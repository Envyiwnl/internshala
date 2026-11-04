import { signOut } from "firebase/auth";

import { auth } from "@/firebase/firebase";
import {
  clearLoginSecurityStorage,
  getLoginSessionToken,
} from "@/utils/loginSession";

const loginSessionErrors = new Set([
  "LOGIN_SESSION_REQUIRED",
  "INVALID_LOGIN_SESSION",
  "LOGIN_SESSION_INACTIVE",
  "LOGIN_SESSION_NOT_ACTIVE",
  "LOGIN_SESSION_EXPIRED",
]);

export class AuthenticatedFetchError extends Error {
  code: string;

  constructor(code: string) {
    super(code);

    this.name = "AuthenticatedFetchError";
    this.code = code;
  }
}

const handleInvalidLoginSession = async () => {
  clearLoginSecurityStorage();

  try {
    await signOut(auth);
  } catch (error) {
    console.error("Firebase sign out after invalid app session failed:", error);
  }
};

export const authenticatedFetch = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
) => {
  await auth.authStateReady();
  const firebaseUser = auth.currentUser;

  if (!firebaseUser) {
    throw new AuthenticatedFetchError("FIREBASE_USER_REQUIRED");
  }

  const loginSessionToken = getLoginSessionToken();

  if (!loginSessionToken) {
    await handleInvalidLoginSession();

    throw new AuthenticatedFetchError("LOGIN_SESSION_REQUIRED");
  }

  const idToken = await firebaseUser.getIdToken();

  const headers = new Headers(init.headers);

  headers.set("Authorization", `Bearer ${idToken}`);

  headers.set("X-Login-Session", loginSessionToken);

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    const data = await response
      .clone()
      .json()
      .catch(() => ({}));

    if (typeof data?.error === "string" && loginSessionErrors.has(data.error)) {
      await handleInvalidLoginSession();
    }
  }

  return response;
};
