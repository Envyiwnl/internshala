import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Download, ArrowRight, RefreshCw, CreditCard } from "lucide-react";
import { authenticatedFetch } from "@/utils/authenticatedFetch";

const API_URL = "https://internshala-78tb.onrender.com/api/subscription";

type PlanId = "free" | "bronze" | "silver" | "gold";

type Subscription = {
  plan: PlanId;
  status: string;
  applicationLimit: number | null;
  applicationsUsed: number;
  remainingApplications: number | null;
  unlimited: boolean;
  cycleStart: string | null;
  cycleEnd: string | null;
  renewalDate: string | null;
  cancelAtPeriodEnd: boolean;
};

type SubscriptionHistory = {
  _id: string;
  action: string;
  previousPlan: PlanId;
  newPlan: PlanId;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  createdAt: string;
};

type SubscriptionPayment = {
  _id: string;
  plan: PlanId;
  action: string;
  amount: number;
  currency: string;
  status: string;
  invoiceNumber: string;
  razorpayPaymentId: string;
  paidAt: string | null;
  createdAt: string;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  testMode: boolean;
};

type Props = {
  userId: string;
};

export default function SubscriptionProfile({ userId }: Props) {
  const { t, i18n } = useTranslation();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [history, setHistory] = useState<SubscriptionHistory[]>([]);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState("");

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    const endpoints = ["/me", "/history", "/payments"];

    const responses = await Promise.all(
      endpoints.map((endpoint) =>
        authenticatedFetch(`${API_URL}${endpoint}`, { signal }),
      ),
    );

    const data = await Promise.all(
      responses.map((response) => response.json()),
    );

    responses.forEach((response, index) => {
      if (!response.ok) {
        throw new Error(
          data[index]?.error || "SUBSCRIPTION_PROFILE_FETCH_FAILED",
        );
      }
    });

    return {
      subscription: data[0].subscription as Subscription,
      history: data[1].history as SubscriptionHistory[],
      payments: data[2].payments as SubscriptionPayment[],
    };
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        setError("");

        const result = await fetchData(signal);

        if (signal?.aborted) return;

        setSubscription(result.subscription);
        setHistory(result.history);
        setPayments(result.payments);
      } catch (err) {
        if (
          signal?.aborted ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "SUBSCRIPTION_PROFILE_FETCH_FAILED",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [fetchData],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);

    return () => controller.abort();
  }, [load, userId]);

  const formatDate = (date: string | null | undefined) =>
    date
      ? new Date(date).toLocaleDateString(
          i18n.resolvedLanguage || i18n.language || "en",
          { day: "numeric", month: "short", year: "numeric" },
        )
      : "—";

  const formatMoney = (amount: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage || "en", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount / 100);

  const planName = (plan: PlanId) => t(`subscription.plans.${plan}`);

  const downloadInvoice = async (payment: SubscriptionPayment) => {
    if (downloadingId) return;

    try {
      setDownloadingId(payment._id);
      setError("");

      const response = await authenticatedFetch(
        `${API_URL}/payments/${payment._id}/invoice`,
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "INVOICE_DOWNLOAD_FAILED");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `${payment.invoiceNumber}.pdf`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "INVOICE_DOWNLOAD_FAILED");
    } finally {
      setDownloadingId("");
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-gray-200 p-5">
        <p className="text-sm text-gray-600">{t("subscription.loading")}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-blue-100 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            {t("subscriptionProfile.heading")}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
        >
          <RefreshCw className="h-4 w-4" />
          {t("subscriptionProfile.refresh")}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {t(`subscription.errors.${error}`, {
            defaultValue: error,
          })}
        </p>
      )}

      {subscription && (
        <>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-gray-500">
                {t("subscription.currentPlan")}
              </p>
              <p className="font-semibold text-gray-900">
                {planName(subscription.plan)}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500">
                {t("subscription.remaining")}
              </p>
              <p className="font-semibold text-gray-900">
                {subscription.unlimited
                  ? t("subscription.unlimited")
                  : subscription.remainingApplications}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500">
                {t("subscriptionProfile.used")}
              </p>
              <p className="font-semibold text-gray-900">
                {subscription.applicationsUsed}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500">
                {t("subscriptionProfile.limit")}
              </p>
              <p className="font-semibold text-gray-900">
                {subscription.applicationLimit === null
                  ? t("subscription.unlimited")
                  : subscription.applicationLimit}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500">
                {t("subscriptionProfile.cycleStart")}
              </p>
              <p className="font-semibold text-gray-900">
                {formatDate(subscription.cycleStart)}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500">
                {t("subscriptionProfile.nextDate")}
              </p>
              <p className="font-semibold text-gray-900">
                {formatDate(subscription.renewalDate)}
              </p>
            </div>
          </div>

          {subscription.cancelAtPeriodEnd && (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              {t("subscription.cancellationScheduled")}
            </p>
          )}
        </>
      )}

      <Link
        href="/subscription"
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        {t("subscriptionProfile.manage")}
        <ArrowRight className="h-4 w-4" />
      </Link>

      <div className="mt-6 border-t border-gray-200 pt-5">
        <h3 className="font-semibold text-gray-900">
          {t("subscriptionProfile.history")}
        </h3>

        {history.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            {t("subscriptionProfile.noHistory")}
          </p>
        ) : (
          <div className="mt-3 max-h-56 divide-y overflow-y-auto">
            {history.map((entry) => (
              <div
                key={entry._id}
                className="flex items-start justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {t(`subscriptionProfile.actions.${entry.action}`, {
                      defaultValue: entry.action,
                    })}
                  </p>
                  <p className="text-xs text-gray-500">
                    {planName(entry.previousPlan)} → {planName(entry.newPlan)}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-gray-500">
                  {formatDate(entry.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-gray-200 pt-5">
        <h3 className="font-semibold text-gray-900">
          {t("subscriptionProfile.payments")}
        </h3>

        {payments.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            {t("subscriptionProfile.noPayments")}
          </p>
        ) : (
          <div className="mt-3 max-h-72 divide-y overflow-y-auto">
            {payments.map((payment) => (
              <div
                key={payment._id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {planName(payment.plan)} — {formatMoney(payment.amount)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(payment.paidAt || payment.createdAt)}
                    {" · "}
                    {t(`subscriptionProfile.status.${payment.status}`, {
                      defaultValue: payment.status,
                    })}
                  </p>
                  {payment.status === "paid" && (
                    <p className="mt-1 text-xs text-gray-500">
                      {payment.invoiceNumber}
                    </p>
                  )}
                </div>

                {payment.status === "paid" && payment.invoiceNumber && (
                  <button
                    type="button"
                    disabled={Boolean(downloadingId)}
                    onClick={() => void downloadInvoice(payment)}
                    className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    {downloadingId === payment._id
                      ? t("subscriptionProfile.downloading")
                      : t("subscriptionProfile.invoice")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
