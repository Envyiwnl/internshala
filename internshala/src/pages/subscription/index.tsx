import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { useTranslation } from "react-i18next";
import { auth } from "@/firebase/firebase";
import { authenticatedFetch } from "@/utils/authenticatedFetch";

const API_URL = "https://internshala-78tb.onrender.com/api/subscription";

type PlanId = "free" | "bronze" | "silver" | "gold";
type Plan = {
  name: string;
  price: number;
  applicationLimit: number | null;
};
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
type Order = {
  paymentRecordId: string;
  order: { id: string; amount: number; currency: string };
  plan: PlanId;
  action: string;
  keyId: string;
};
type RazorpayResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type RazorpayCheckout = {
  open: () => void;
  on: (event: string, callback: () => void) => void;
};
type RazorpayConstructor = new (options: {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
  handler: (result: RazorpayResult) => void;
  modal: { ondismiss: () => void };
}) => RazorpayCheckout;

const PLAN_IDS: PlanId[] = ["free", "bronze", "silver", "gold"];

const loadRazorpayScript = async (): Promise<boolean> => {
  if (typeof window === "undefined") return false;

  const existingRazorpay = (
    window as Window & { Razorpay?: RazorpayConstructor }
  ).Razorpay;

  if (existingRazorpay) return true;

  const existing = document.querySelector<HTMLScriptElement>(
    'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
  );

  if (existing?.dataset.loaded === "true") return true;

  return new Promise((resolve) => {
    const script = existing || document.createElement("script");

    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve(true);
      },
      { once: true },
    );

    script.addEventListener("error", () => resolve(false), { once: true });

    if (!existing) {
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.body.appendChild(script);
    }
  });
};

const request = async <T,>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const response = await authenticatedFetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP_${response.status}`);
  }

  return data as T;
};

export default function SubscriptionPage() {
  const { t, i18n } = useTranslation();

  const [uid, setUid] = useState<string | null>(null);
  const [plans, setPlans] = useState<Record<PlanId, Plan> | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [pending, setPending] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [billing, setBilling] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    country: "India",
  });

  const storageKey = uid ? `internship-subscription-order:${uid}` : "";

  const loadPlans = useCallback(async () => {
    const response = await fetch(`${API_URL}/plans`);

    if (!response.ok) throw new Error("PLANS_FETCH_FAILED");

    const data = (await response.json()) as {
      plans: Record<PlanId, Plan>;
    };

    setPlans(data.plans);
  }, []);

  const refresh = useCallback(async () => {
    const currentData = await request<{ subscription: Subscription }>("/me");
    setSubscription(currentData.subscription);
    await loadPlans();
  }, [loadPlans]);

  const clearPending = useCallback(() => {
    if (storageKey) localStorage.removeItem(storageKey);
    setPending(null);
  }, [storageKey]);

  const syncPayment = useCallback(async (paymentRecordId: string) => {
    return request<{ status: string; reason?: string }>("/sync-payment", {
      method: "POST",
      body: JSON.stringify({ paymentRecordId }),
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUid(firebaseUser?.uid || null);

      if (!firebaseUser) {
        setPending(null);
        setSubscription(null);

        try {
          setLoading(true);
          await loadPlans();
        } catch (err) {
          setError(err instanceof Error ? err.message : "PLANS_FETCH_FAILED");
        } finally {
          setLoading(false);
        }

        return;
      }

      try {
        setLoading(true);
        await refresh();

        const saved = localStorage.getItem(
          `internship-subscription-order:${firebaseUser.uid}`,
        );

        if (saved) {
          const order = JSON.parse(saved) as Order;
          const result = await syncPayment(order.paymentRecordId);

          if (result.status === "paid") {
            localStorage.removeItem(
              `internship-subscription-order:${firebaseUser.uid}`,
            );
            await refresh();
          } else if (
            result.status === "created" ||
            result.status === "pending"
          ) {
            setPending(order);
          } else {
            localStorage.removeItem(
              `internship-subscription-order:${firebaseUser.uid}`,
            );
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "FETCH_FAILED");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [refresh, syncPayment, loadPlans]);

  const formatDate = (date: string | null) =>
    date
      ? new Date(date).toLocaleDateString(i18n.resolvedLanguage || "en", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "—";

  const money = (paise: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage || "en", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(paise / 100);

  const runSync = async (order: Order) => {
    const result = await syncPayment(order.paymentRecordId);

    if (result.status === "paid") {
      clearPending();
      await refresh();
      setNotice(t("subscription.paymentSuccessful"));
    } else {
      setNotice(t("subscription.paymentPending"));
    }
  };

  const checkout = async (order: Order) => {
    const loaded = await loadRazorpayScript();

    if (!loaded) throw new Error("RAZORPAY_SCRIPT_FAILED");

    const Razorpay = (window as Window & { Razorpay?: RazorpayConstructor })
      .Razorpay;

    if (!Razorpay) throw new Error("RAZORPAY_SCRIPT_FAILED");

    const instance = new Razorpay({
      key: order.keyId,
      amount: order.order.amount,
      currency: order.order.currency,
      order_id: order.order.id,
      name: "Internshala",
      description: `${order.plan.toUpperCase()} subscription`,
      prefill: {
        name: billing.name,
        email: auth.currentUser?.email || "",
      },
      handler: async (result: RazorpayResult) => {
        setBusy(true);
        setError("");

        try {
          await request("/verify-payment", {
            method: "POST",
            body: JSON.stringify({
              paymentRecordId: order.paymentRecordId,
              ...result,
            }),
          });

          clearPending();
          await refresh();
          setNotice(t("subscription.paymentSuccessful"));
        } catch {
          try {
            await runSync(order);
          } catch (err) {
            setError(err instanceof Error ? err.message : "PAYMENT_FAILED");
          }
        } finally {
          setBusy(false);
        }
      },
      modal: {
        ondismiss: () => {
          setNotice(t("subscription.checkoutClosed"));
        },
      },
    });

    instance.on("payment.failed", () => {
      setError(t("subscription.paymentFailed"));
    });

    instance.open();
  };

  const beginPayment = async (plan: PlanId) => {
    if (busy || !uid) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (pending) {
        if (pending.plan !== plan) {
          throw new Error("ANOTHER_SUBSCRIPTION_ORDER_PENDING");
        }

        const result = await syncPayment(pending.paymentRecordId);

        if (result.status === "paid") {
          clearPending();
          await refresh();
          setNotice(t("subscription.paymentSuccessful"));
          return;
        }

        if (result.status !== "created") {
          setNotice(t("subscription.paymentPending"));
          return;
        }

        await checkout(pending);
        return;
      }

      const order = await request<Order>("/create-order", {
        method: "POST",
        body: JSON.stringify({ plan, billingDetails: billing }),
      });

      localStorage.setItem(storageKey, JSON.stringify(order));
      setPending(order);
      await checkout(order);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PAYMENT_FAILED");
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async () => {
    if (!pending || busy) return;

    setBusy(true);
    setError("");

    try {
      const result = await request<{ status: string }>("/cancel-order", {
        method: "POST",
        body: JSON.stringify({ paymentRecordId: pending.paymentRecordId }),
      });

      if (result.status === "paid") {
        await refresh();
      }

      clearPending();
      setNotice(t("subscription.orderResolved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "PAYMENT_FAILED");
    } finally {
      setBusy(false);
    }
  };

  const cancelSubscription = async () => {
    if (busy || !subscription || subscription.plan === "free") return;
    if (!window.confirm(t("subscription.confirmCancel"))) return;

    setBusy(true);
    setError("");

    try {
      await request("/cancel", { method: "POST" });
      await refresh();
      setNotice(t("subscription.cancellationScheduled"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "CANCEL_FAILED");
    } finally {
      setBusy(false);
    }
  };

  const planAction = (plan: PlanId): string => {
    if (!subscription || plan === "free") return "";
    if (subscription.plan === plan) return t("subscription.renew");

    const currentPrice = plans?.[subscription.plan]?.price || 0;
    const nextPrice = plans?.[plan]?.price || 0;

    if (subscription.plan === "free") return t("subscription.purchase");
    return nextPrice > currentPrice
      ? t("subscription.upgrade")
      : t("subscription.downgrade");
  };

  if (loading) {
    return (
      <div className="min-h-screen p-10 text-center text-gray-700">
        {t("subscription.loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            {t("subscription.title")}
          </h1>
          <p className="mt-2 text-gray-600">{t("subscription.description")}</p>
          <p className="mt-2 text-sm text-blue-700">
            {t("subscription.paymentHours")}
          </p>
        </header>

        {!uid && (
          <div className="rounded-xl bg-white p-6 text-center text-gray-800">
            <Link href="/auth?mode=login" className="text-blue-600 underline">
              {t("subscription.loginRequired")}
            </Link>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
            {t(`subscription.errors.${error}`, { defaultValue: error })}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="rounded-xl bg-blue-50 p-4 text-blue-800"
          >
            {notice}
          </div>
        )}

        {uid && subscription && (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">
              {t("subscription.currentPlan")}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-gray-500">
                  {t("subscription.plan")}
                </p>
                <p className="text-xl font-bold capitalize text-gray-900">
                  {t(`subscription.plans.${subscription.plan}`)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">
                  {t("subscription.remaining")}
                </p>
                <p className="text-xl font-bold text-gray-900">
                  {subscription.unlimited
                    ? t("subscription.unlimited")
                    : subscription.remainingApplications}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">
                  {t("subscription.cycleEnd")}
                </p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatDate(subscription.cycleEnd)}
                </p>
              </div>
            </div>

            {subscription.cancelAtPeriodEnd && (
              <p className="mt-4 text-amber-700">
                {t("subscription.cancellationScheduled")}
              </p>
            )}

            {subscription.plan !== "free" &&
              !subscription.cancelAtPeriodEnd && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={cancelSubscription}
                  className="mt-5 rounded-lg border border-red-300 px-4 py-2 text-red-700 disabled:opacity-50"
                >
                  {t("subscription.cancelSubscription")}
                </button>
              )}
          </section>
        )}

        <section className="grid gap-5 md:grid-cols-4">
          {PLAN_IDS.map((id) => {
            const plan = plans?.[id];
            if (!plan) return null;

            return (
              <article
                key={id}
                className="flex flex-col rounded-2xl border bg-white p-6 shadow-sm"
              >
                <h2 className="text-xl font-bold text-gray-900">
                  {t(`subscription.plans.${id}`)}
                </h2>
                <p className="mt-3 text-3xl font-bold text-blue-700">
                  {money(plan.price)}
                  <span className="text-sm font-normal text-gray-500">
                    {t("subscription.perMonth")}
                  </span>
                </p>
                <p className="mt-4 flex-1 text-gray-700">
                  {plan.applicationLimit === null
                    ? t("subscription.unlimited")
                    : t("subscription.applicationLimit", {
                        count: plan.applicationLimit,
                      })}
                </p>

                {id === subscription?.plan && (
                  <p className="mb-3 text-sm font-medium text-green-700">
                    {t("subscription.currentPlan")}
                  </p>
                )}

                {id === "free" ? (
                  <p className="rounded-lg bg-gray-100 p-3 text-center text-sm text-gray-700">
                    {t("subscription.freeDefault")}
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={!uid || busy || !subscription}
                    onClick={() => beginPayment(id)}
                    className="rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {planAction(id)}
                  </button>
                )}
              </article>
            );
          })}
        </section>

        {uid && (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">
              {t("subscription.billingDetails")}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(
                [
                  "name",
                  "address",
                  "city",
                  "state",
                  "postalCode",
                  "country",
                ] as const
              ).map((field) => (
                <label key={field} className="block">
                  <span className="mb-1 block text-sm text-gray-700">
                    {t(`subscription.billing.${field}`)}
                  </span>
                  <input
                    type="text"
                    value={billing[field]}
                    maxLength={200}
                    disabled={busy || Boolean(pending)}
                    onChange={(event) =>
                      setBilling((previous) => ({
                        ...previous,
                        [field]: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                  />
                </label>
              ))}
            </div>
          </section>
        )}

        {pending && (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
            <h2 className="font-semibold text-amber-900">
              {t("subscription.pendingOrder")}
            </h2>
            <p className="mt-2 text-sm text-amber-800">
              {t("subscription.pendingExplanation")}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await runSync(pending);
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "SYNC_FAILED",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
              >
                {t("subscription.checkPayment")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={cancelOrder}
                className="rounded-lg border border-amber-500 px-4 py-2 text-amber-900 disabled:opacity-50"
              >
                {t("subscription.closeOrder")}
              </button>
            </div>
          </section>
        )}

        <div className="text-center">
          <Link href="/profile" className="text-blue-600 hover:underline">
            {t("subscription.backToProfile")}
          </Link>
        </div>
      </div>
    </div>
  );
}
