import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  Globe2,
  Laptop,
  MapPin,
  MonitorSmartphone,
  ShieldCheck,
} from "lucide-react";

import { auth } from "@/firebase/firebase";
import { authenticatedFetch } from "@/utils/authenticatedFetch";
import { getLoginSessionToken } from "@/utils/loginSession";

const API_URL = "https://internshala-78tb.onrender.com";

type LoginHistoryItem = {
  _id: string;

  loginStatus: "pending" | "otp_pending" | "success" | "rejected" | "failed";

  failureReason: string;

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
    required: boolean;
    method: "none" | "email_otp";
    status: "not_required" | "pending" | "verified" | "failed" | "expired";
  };

  session: {
    status: "none" | "pending" | "active" | "revoked" | "expired";

    createdAt: string | null;
    lastSeenAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
    revokedReason: string;
  };

  isCurrentSession: boolean;
};

const getStatusClasses = (status: LoginHistoryItem["loginStatus"]) => {
  switch (status) {
    case "success":
      return "bg-green-100 text-green-700";

    case "rejected":
    case "failed":
      return "bg-red-100 text-red-700";

    case "otp_pending":
      return "bg-amber-100 text-amber-700";

    default:
      return "bg-gray-100 text-gray-700";
  }
};

export default function LoginHistory() {
  const { t, i18n } = useTranslation();

  const [history, setHistory] = useState<LoginHistoryItem[]>([]);

  const [loading, setLoading] = useState(true);

  const [errorKey, setErrorKey] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      const loginSessionToken = getLoginSessionToken();

      if (!currentUser || !loginSessionToken) {
        setHistory([]);

        setErrorKey("loginHistory.loginRequired");

        setLoading(false);

        return;
      }

      try {
        setLoading(true);

        setErrorKey("");

        const response = await authenticatedFetch(
          `${API_URL}/api/login-security/history`,
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "LOGIN_HISTORY_FETCH_FAILED");
        }

        setHistory(Array.isArray(data.history) ? data.history : []);
      } catch (error) {
        console.error("Login history fetch failed:", error);

        setErrorKey("loginHistory.loadFailed");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const formatLocation = (item: LoginHistoryItem) => {
    const values = [
      item.location?.city,
      item.location?.region,
      item.location?.country,
    ].filter(Boolean);

    return values.length ? values.join(", ") : t("common.unknown");
  };

  const formatDevice = (item: LoginHistoryItem) => {
    const name = [item.device?.vendor, item.device?.model]
      .filter(Boolean)
      .join(" ");

    return name || item.device?.type
      ? `${name}${
          name && item.device?.type ? " · " : ""
        }${item.device?.type || ""}`
      : t("common.unknown");
  };

  if (loading) {
    return (
      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500">{t("loginHistory.loading")}</p>
      </section>
    );
  }

  if (errorKey) {
    return (
      <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-600">{t(errorKey)}</p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <ShieldCheck className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {t("loginHistory.title")}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {t("loginHistory.description")}
            </p>
          </div>
        </div>
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-gray-500">{t("loginHistory.empty")}</p>
      ) : (
        <div className="space-y-4">
          {history.map((item) => (
            <article
              key={item._id}
              className="rounded-xl border border-gray-200 p-4"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                    <MonitorSmartphone className="h-5 w-5" />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-900">
                        {item.browser?.name || t("common.unknown")}

                        {item.browser?.version && ` ${item.browser.version}`}
                      </p>

                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${getStatusClasses(
                          item.loginStatus,
                        )}`}
                      >
                        {t(`loginHistory.status.${item.loginStatus}`)}
                      </span>

                      {item.isCurrentSession && (
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                          {t("loginHistory.currentSession")}
                        </span>
                      )}

                      {item.environment?.trusted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          <CheckCircle2 className="h-3 w-3" />

                          {t("loginHistory.trusted")}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-gray-500">
                      {item.os?.name || t("common.unknown")}

                      {item.os?.version && ` ${item.os.version}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Clock3 className="h-4 w-4" />

                  {new Date(item.loginAt).toLocaleString(
                    i18n.resolvedLanguage || i18n.language,
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-gray-600 sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <Laptop className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />

                  <span>{formatDevice(item)}</span>
                </div>

                <div className="flex items-start gap-2">
                  <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />

                  <span>{item.ipAddress || t("common.unknown")}</span>
                </div>

                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />

                  <span>{formatLocation(item)}</span>
                </div>

                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />

                  <span>
                    {item.verification?.method === "email_otp"
                      ? t("loginHistory.emailOtp")
                      : t("loginHistory.noOtp")}
                  </span>
                </div>
              </div>

              {(item.environment?.isNewBrowser ||
                item.environment?.isNewDevice ||
                item.environment?.isNewIp) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.environment.isNewBrowser && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      <CircleAlert className="h-3 w-3" />

                      {t("loginHistory.newBrowser")}
                    </span>
                  )}

                  {item.environment.isNewDevice && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      <CircleAlert className="h-3 w-3" />

                      {t("loginHistory.newDevice")}
                    </span>
                  )}

                  {item.environment.isNewIp && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      <CircleAlert className="h-3 w-3" />

                      {t("loginHistory.newIp")}
                    </span>
                  )}
                </div>
              )}

              {item.failureReason && (
                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  {t("loginHistory.failureReason")}: {item.failureReason}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
