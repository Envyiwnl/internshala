import { useEffect, useState } from "react";
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
  const [history, setHistory] = useState<LanguageHistoryItem[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (!currentUser) {
        setHistory([]);
        setError("You must be logged in to view language history.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

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

        setError("Unable to load language history.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500">Loading language history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          Language History
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Recent changes to your language preference.
        </p>
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-gray-500">
          No language changes recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-3 py-3 font-medium">Change</th>

                <th className="px-3 py-3 font-medium">Verification</th>

                <th className="px-3 py-3 font-medium">Browser</th>

                <th className="px-3 py-3 font-medium">Operating System</th>

                <th className="px-3 py-3 font-medium">Device</th>

                <th className="px-3 py-3 font-medium">IP Address</th>

                <th className="px-3 py-3 font-medium">Date</th>
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
                      ? "Email OTP"
                      : "Standard"}
                  </td>

                  <td className="px-3 py-4 text-gray-600">
                    {item.browser.name || "Unknown"}

                    {item.browser.version && ` ${item.browser.version}`}
                  </td>

                  <td className="px-3 py-4 text-gray-600">
                    {item.os.name || "Unknown"}

                    {item.os.version && ` ${item.os.version}`}
                  </td>

                  <td className="px-3 py-4 text-gray-600">
                    {item.device.type || "desktop"}
                  </td>

                  <td className="px-3 py-4 text-gray-600">
                    {item.ipAddress || "Unknown"}
                  </td>

                  <td className="px-3 py-4 whitespace-nowrap text-gray-600">
                    {new Date(item.changedAt).toLocaleString()}
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
