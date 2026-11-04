import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Globe2,
  Laptop,
  LogOut,
  MapPin,
  MonitorSmartphone,
  ShieldCheck,
} from "lucide-react";

import { auth } from "@/firebase/firebase";
import { authenticatedFetch } from "@/utils/authenticatedFetch";
import { getLoginSessionToken } from "@/utils/loginSession";

const API_URL = "https://internshala-78tb.onrender.com";

type ActiveSession = {
  _id: string;

  loginAt: string;

  ipAddress: string;

  browser: {
    name: string;
    version: string;
  };

  os: {
    name: string;
    version: string;
  };

  device: {
    type: "desktop" | "laptop" | "tablet" | "mobile" | "unknown";

    vendor: string;
    model: string;
  };

  location: {
    city: string;
    region: string;
    country: string;
    countryCode: string;
    timezone: string;
  };

  environment: {
    trusted: boolean;
    isNewBrowser: boolean;
    isNewDevice: boolean;
    isNewIp: boolean;
  };

  verification: {
    method: "none" | "email_otp";
  };

  session: {
    status: "active";
    createdAt: string | null;
    lastSeenAt: string | null;
    expiresAt: string | null;
  };

  isCurrentSession: boolean;
};

export default function ActiveSessions() {
  const { t, i18n } = useTranslation();

  const [sessions, setSessions] = useState<ActiveSession[]>([]);

  const [loading, setLoading] = useState(true);

  const [errorKey, setErrorKey] = useState("");

  const [revokingId, setRevokingId] = useState("");

  const [revokingOthers, setRevokingOthers] = useState(false);

  const fetchSessions = useCallback(async () => {
    const loginSessionToken = getLoginSessionToken();

    if (!auth.currentUser || !loginSessionToken) {
      setSessions([]);

      setErrorKey("activeSessions.loginRequired");

      setLoading(false);

      return;
    }

    try {
      setLoading(true);

      setErrorKey("");

      const response = await authenticatedFetch(
        `${API_URL}/api/login-security/sessions`,
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "ACTIVE_SESSIONS_FETCH_FAILED");
      }

      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch (error) {
      console.error("Active sessions fetch failed:", error);

      setErrorKey("activeSessions.loadFailed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (!currentUser) {
        setSessions([]);

        setErrorKey("activeSessions.loginRequired");

        setLoading(false);

        return;
      }

      await fetchSessions();
    });

    return () => unsubscribe();
  }, [fetchSessions]);

  const handleRevokeSession = async (activityId: string) => {
    if (revokingId || revokingOthers) {
      return;
    }

    try {
      setRevokingId(activityId);

      setErrorKey("");

      const response = await authenticatedFetch(
        `${API_URL}/api/login-security/sessions/${activityId}/revoke`,
        {
          method: "POST",
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "SESSION_REVOCATION_FAILED");
      }

      setSessions((current) =>
        current.filter((session) => session._id !== activityId),
      );
    } catch (error) {
      console.error("Session revocation failed:", error);

      setErrorKey("activeSessions.revokeFailed");
    } finally {
      setRevokingId("");
    }
  };

  const handleRevokeOthers = async () => {
    if (revokingOthers || revokingId) {
      return;
    }

    try {
      setRevokingOthers(true);

      setErrorKey("");

      const response = await authenticatedFetch(
        `${API_URL}/api/login-security/sessions/revoke-others`,
        {
          method: "POST",
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "OTHER_SESSIONS_REVOCATION_FAILED");
      }

      setSessions((current) =>
        current.filter((session) => session.isCurrentSession),
      );
    } catch (error) {
      console.error("Other session revocation failed:", error);

      setErrorKey("activeSessions.revokeOthersFailed");
    } finally {
      setRevokingOthers(false);
    }
  };

  const formatLocation = (session: ActiveSession) => {
    const values = [
      session.location?.city,
      session.location?.region,
      session.location?.country,
    ].filter(Boolean);

    return values.length ? values.join(", ") : t("common.unknown");
  };

  const formatDevice = (session: ActiveSession) => {
    const name = [session.device?.vendor, session.device?.model]
      .filter(Boolean)
      .join(" ");

    if (name) {
      return session.device?.type ? `${name} · ${session.device.type}` : name;
    }

    return session.device?.type || t("common.unknown");
  };

  const otherSessions = sessions.filter((session) => !session.isCurrentSession);

  if (loading) {
    return (
      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500">{t("activeSessions.loading")}</p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <ShieldCheck className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {t("activeSessions.title")}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {t("activeSessions.description")}
            </p>
          </div>
        </div>

        {otherSessions.length > 0 && (
          <button
            type="button"
            onClick={handleRevokeOthers}
            disabled={revokingOthers || Boolean(revokingId)}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />

            {revokingOthers
              ? t("activeSessions.signingOutOthers")
              : t("activeSessions.signOutOthers")}
          </button>
        )}
      </div>

      {errorKey && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">{t(errorKey)}</p>
        </div>
      )}

      {sessions.length === 0 ? (
        <p className="text-sm text-gray-500">{t("activeSessions.empty")}</p>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => (
            <article
              key={session._id}
              className={`rounded-xl border p-4 ${
                session.isCurrentSession
                  ? "border-blue-200 bg-blue-50/40"
                  : "border-gray-200"
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                    <MonitorSmartphone className="h-5 w-5" />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-900">
                        {session.browser?.name || t("common.unknown")}

                        {session.browser?.version &&
                          ` ${session.browser.version}`}
                      </p>

                      {session.isCurrentSession && (
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                          {t("activeSessions.current")}
                        </span>
                      )}

                      {session.environment?.trusted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          <CheckCircle2 className="h-3 w-3" />

                          {t("activeSessions.trusted")}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-gray-500">
                      {session.os?.name || t("common.unknown")}

                      {session.os?.version && ` ${session.os.version}`}
                    </p>
                  </div>
                </div>

                {!session.isCurrentSession && (
                  <button
                    type="button"
                    onClick={() => handleRevokeSession(session._id)}
                    disabled={revokingId === session._id || revokingOthers}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <LogOut className="h-4 w-4" />

                    {revokingId === session._id
                      ? t("activeSessions.signingOut")
                      : t("activeSessions.signOut")}
                  </button>
                )}
              </div>

              <div className="mt-4 grid gap-3 text-sm text-gray-600 sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <Laptop className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />

                  <span>{formatDevice(session)}</span>
                </div>

                <div className="flex items-start gap-2">
                  <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />

                  <span>{session.ipAddress || t("common.unknown")}</span>
                </div>

                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />

                  <span>{formatLocation(session)}</span>
                </div>

                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />

                  <span>
                    {session.verification?.method === "email_otp"
                      ? t("activeSessions.emailOtp")
                      : t("activeSessions.noOtp")}
                  </span>
                </div>
              </div>

              <div className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
                {t("activeSessions.lastActive")}:{" "}
                {session.session?.lastSeenAt
                  ? new Date(session.session.lastSeenAt).toLocaleString(
                      i18n.resolvedLanguage || i18n.language,
                    )
                  : t("common.unknown")}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
