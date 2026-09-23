import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { auth } from "@/firebase/firebase";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n/i18n";

interface LanguageHistoryItem {
  _id: string;

  previousLanguage: SupportedLanguage;
  selectedLanguage: SupportedLanguage;

  verificationMethod: "standard" | "email-otp";

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
    type: string;
    vendor: string;
    model: string;
  };

  changedAt: string;
}

export default function LanguageHistory() {
  const { t, i18n } = useTranslation();

  const [history, setHistory] = useState<LanguageHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [errorKey, setErrorKey] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (!currentUser) {
        setHistory([]);
        setErrorKey("history.loginRequired");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErrorKey("");

        const idToken = await currentUser.getIdToken();

        const response = await fetch(
          "https://internshala-78tb.onrender.com/api/language/history",
          {
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch language history");
        }

        setHistory(data.history);
      } catch (error) {
        console.error("Language history fetch failed:", error);

        setErrorKey("history.loadFailed");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500">{t("history.loading")}</p>
      </div>
    );
  }

  if (errorKey) {
    return (
      <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-600">{t(errorKey)}</p>
      </div>
    );
  }

  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          {t("history.title")}
        </h2>

        <p className="mt-1 text-sm text-gray-500">{t("history.description")}</p>
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-gray-500">{t("history.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-3 py-3 font-medium">{t("history.change")}</th>

                <th className="px-3 py-3 font-medium">
                  {t("history.verification")}
                </th>

                <th className="px-3 py-3 font-medium">
                  {t("history.browser")}
                </th>

                <th className="px-3 py-3 font-medium">
                  {t("history.operatingSystem")}
                </th>

                <th className="px-3 py-3 font-medium">{t("history.device")}</th>

                <th className="px-3 py-3 font-medium">
                  {t("history.ipAddress")}
                </th>

                <th className="px-3 py-3 font-medium">{t("history.date")}</th>
              </tr>
            </thead>

            <tbody>
              {history.map((item) => (
                <tr
                  key={item._id}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="px-3 py-4 font-medium text-gray-900">
                    {SUPPORTED_LANGUAGES[item.previousLanguage]}
                    {" → "}
                    {SUPPORTED_LANGUAGES[item.selectedLanguage]}
                  </td>

                  <td className="px-3 py-4 text-gray-600">
                    {item.verificationMethod === "email-otp"
                      ? t("history.emailOtp")
                      : t("history.standard")}
                  </td>

                  <td className="px-3 py-4 text-gray-600">
                    {item.browser.name || t("common.unknown")}

                    {item.browser.version && ` ${item.browser.version}`}
                  </td>

                  <td className="px-3 py-4 text-gray-600">
                    {item.os.name || t("common.unknown")}

                    {item.os.version && ` ${item.os.version}`}
                  </td>

                  <td className="px-3 py-4 text-gray-600">
                    {item.device.type || t("common.unknown")}
                  </td>

                  <td className="px-3 py-4 text-gray-600">
                    {item.ipAddress || t("common.unknown")}
                  </td>

                  <td className="px-3 py-4 whitespace-nowrap text-gray-600">
                    {new Date(item.changedAt).toLocaleString(
                      i18n.resolvedLanguage || i18n.language,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
