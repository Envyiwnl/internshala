import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  FileText,
  Loader2,
  ReceiptText,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useTranslation } from "react-i18next";

const API_URL = "https://internshala-78tb.onrender.com";

type ResumeVersion = {
  versionNumber: number;
  customization?: {
    template?: string;
    color?: string;
    font?: string;
  };
  generatedAt?: string;
};

type DownloadEntry = {
  versionNumber: number;
  downloadedAt: string;
  ipAddress?: string;
  userAgent?: string;
};

type ResumeHistory = {
  _id: string;
  title: string;
  status: string;
  isDefault: boolean;
  currentVersion: number;
  versions: ResumeVersion[];
  downloadHistory: DownloadEntry[];
  createdAt: string;
  updatedAt: string;
};

type Payment = {
  _id: string;
  resume?: {
    _id: string;
    title?: string;
  } | null;
  amount: number;
  currency: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  status: string;
  otpVerified?: boolean;
  otpVerifiedAt?: string;
  versionNumber?: number | null;
  generationStatus?: string;
  invoiceNumber?: string;
  paidAt?: string;
  failedAt?: string;
  cancelledAt?: string;
  failureReason?: string;
  testMode?: boolean;
  createdAt: string;
  updatedAt: string;
};

type Invoice = {
  invoiceNumber: string;
  paymentRecordId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  resumeId: string | null;
  resumeTitle: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  amountInRupees: number;
  currency: string;
  versionNumber: number | null;
  paidAt: string;
  generationStatus: string;
  testMode: boolean;
};

const index = () => {
  const { t, i18n } = useTranslation();

  const [resumes, setResumes] = useState<ResumeHistory[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(true);
  const [error, setError] = useState("");

  const [downloadingKey, setDownloadingKey] = useState("");

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [invoiceLoadingId, setInvoiceLoadingId] = useState("");
  const [invoiceError, setInvoiceError] = useState("");

  const formatDate = (date?: string) => {
    if (!date) {
      return "-";
    }

    return new Date(date).toLocaleString(
      i18n.resolvedLanguage || i18n.language,
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );
  };

  const getAuthenticatedToken = async () => {
    const firebaseUser = getAuth().currentUser;

    if (!firebaseUser) {
      throw new Error("AUTHENTICATION_REQUIRED");
    }

    return firebaseUser.getIdToken();
  };

  const loadHistory = async (firebaseUser: any, signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError("");

      const token = await firebaseUser.getIdToken();

      const [historyResponse, paymentResponse] = await Promise.all([
        fetch(`${API_URL}/api/resume/history`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal,
        }),

        fetch(`${API_URL}/api/resume/payments`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal,
        }),
      ]);

      const historyData = await historyResponse.json();
      const paymentData = await paymentResponse.json();

      if (
        historyResponse.status === 403 &&
        historyData.error === "PREMIUM_REQUIRED"
      ) {
        setIsPremium(false);
        setResumes([]);
        setPayments([]);
        return;
      }

      if (!historyResponse.ok) {
        throw new Error(historyData.error || "RESUME_HISTORY_FETCH_FAILED");
      }

      if (!paymentResponse.ok) {
        throw new Error(paymentData.error || "PAYMENT_HISTORY_FETCH_FAILED");
      }

      setIsPremium(true);
      setResumes(historyData.resumes || []);
      setPayments(paymentData.payments || []);
    } catch (error: any) {
      if (error?.name === "AbortError") {
        return;
      }

      console.error("Resume history loading failed:", error);

      setError(t("resumeHistory.loadFailed"));
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const auth = getAuth();
    const controller = new AbortController();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setLoading(false);
        setError(t("resumeHistory.authenticationRequired"));
        return;
      }

      await loadHistory(firebaseUser, controller.signal);
    });

    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [t]);

  const totalVersions = useMemo(() => {
    return resumes.reduce(
      (total, resume) => total + (resume.versions?.length || 0),
      0,
    );
  }, [resumes]);

  const totalDownloads = useMemo(() => {
    return resumes.reduce(
      (total, resume) => total + (resume.downloadHistory?.length || 0),
      0,
    );
  }, [resumes]);

  const paidPayments = useMemo(() => {
    return payments.filter((payment) => payment.status === "paid").length;
  }, [payments]);

  const handleRetry = async () => {
    const firebaseUser = getAuth().currentUser;

    if (!firebaseUser) {
      setError(t("resumeHistory.authenticationRequired"));
      return;
    }

    await loadHistory(firebaseUser);
  };

  const downloadVersion = async (
    resumeId: string,
    resumeTitle: string,
    versionNumber: number,
  ) => {
    const key = `${resumeId}-${versionNumber}`;

    try {
      setDownloadingKey(key);
      setError("");

      const token = await getAuthenticatedToken();

      const response = await fetch(
        `${API_URL}/api/resume/${resumeId}/version/${versionNumber}/download`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("RESUME_DOWNLOAD_FAILED");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const safeTitle = (resumeTitle || "resume")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .replace(/_+/g, "_");

      const anchor = document.createElement("a");

      anchor.href = objectUrl;
      anchor.download = `${safeTitle}_v${versionNumber}.pdf`;

      document.body.appendChild(anchor);

      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(objectUrl);

      setResumes((prev) =>
        prev.map((resume) =>
          resume._id === resumeId
            ? {
                ...resume,
                downloadHistory: [
                  ...(resume.downloadHistory || []),
                  {
                    versionNumber,
                    downloadedAt: new Date().toISOString(),
                  },
                ],
              }
            : resume,
        ),
      );
    } catch (error) {
      console.error("Resume version download failed:", error);

      setError(t("resumeHistory.downloadFailed"));
    } finally {
      setDownloadingKey("");
    }
  };

  const loadInvoice = async (paymentId: string) => {
    try {
      setInvoiceLoadingId(paymentId);
      setInvoiceError("");
      setInvoice(null);

      const token = await getAuthenticatedToken();

      const response = await fetch(
        `${API_URL}/api/resume/payments/${paymentId}/invoice`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "INVOICE_NOT_AVAILABLE") {
          setInvoiceError(t("resumeHistory.invoiceNotAvailable"));
          return;
        }

        throw new Error(data.error || "INVOICE_FETCH_FAILED");
      }

      setInvoice(data.invoice);
    } catch (error) {
      console.error("Invoice fetch failed:", error);

      setInvoiceError(t("resumeHistory.invoiceLoadFailed"));
    } finally {
      setInvoiceLoadingId("");
    }
  };

  const paymentStatusClass = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-700";

      case "failed":
        return "bg-red-100 text-red-700";

      case "cancelled":
        return "bg-gray-100 text-gray-600";

      default:
        return "bg-amber-100 text-amber-700";
    }
  };

  const generationStatusClass = (status?: string) => {
    switch (status) {
      case "generated":
        return "bg-blue-100 text-blue-700";

      case "failed":
        return "bg-red-100 text-red-700";

      case "generating":
        return "bg-amber-100 text-amber-700";

      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-10">
        <div className="flex min-h-[450px] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />

            <p className="mt-3 text-sm text-gray-500">
              {t("resumeHistory.loading")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className="min-h-screen bg-gray-50 py-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/profile/resume"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-blue-600"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("resumeHistory.backToResumes")}
          </Link>

          <div className="mt-8 rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto h-9 w-9 text-amber-600" />

            <h1 className="mt-4 text-xl font-bold text-gray-900">
              {t("resumeBuilder.premiumRequiredTitle")}
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              {t("resumeBuilder.premiumRequiredDescription")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/profile/resume"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-blue-600"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("resumeHistory.backToResumes")}
          </Link>

          <div className="mt-6">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              {t("resumeHistory.title")}
            </h1>

            <p className="mt-2 text-sm text-gray-500 sm:text-base">
              {t("resumeHistory.description")}
            </p>
          </div>

          {error && (
            <div className="mt-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

              <div className="flex-1">{error}</div>

              <button
                type="button"
                onClick={handleRetry}
                className="font-medium underline"
              >
                {t("resumeHistory.retry")}
              </button>
            </div>
          )}

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <FileText className="h-5 w-5 text-blue-600" />

              <p className="mt-4 text-sm text-gray-500">
                {t("resumeHistory.totalVersions")}
              </p>

              <p className="mt-1 text-2xl font-bold text-gray-900">
                {totalVersions}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <Download className="h-5 w-5 text-green-600" />

              <p className="mt-4 text-sm text-gray-500">
                {t("resumeHistory.totalDownloads")}
              </p>

              <p className="mt-1 text-2xl font-bold text-gray-900">
                {totalDownloads}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <CreditCard className="h-5 w-5 text-purple-600" />

              <p className="mt-4 text-sm text-gray-500">
                {t("resumeHistory.successfulPayments")}
              </p>

              <p className="mt-1 text-2xl font-bold text-gray-900">
                {paidPayments}
              </p>
            </div>
          </div>

          <section className="mt-8 rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-6 py-5">
              <h2 className="text-lg font-semibold text-gray-900">
                {t("resumeHistory.resumeVersions")}
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {t("resumeHistory.resumeVersionsDescription")}
              </p>
            </div>

            {resumes.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <FileText className="mx-auto h-8 w-8 text-gray-300" />

                <p className="mt-3 text-sm text-gray-500">
                  {t("resumeHistory.noVersions")}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {resumes.map((resume) => (
                  <div key={resume._id} className="px-6 py-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-gray-900">
                            {resume.title || t("resumeBuilder.untitledResume")}
                          </h3>

                          {resume.isDefault && (
                            <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                              {t("resumeBuilder.defaultResume")}
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-xs text-gray-500">
                          {t("resumeHistory.currentVersion")}: v
                          {resume.currentVersion}
                        </p>
                      </div>

                      <Link
                        href={`/profile/resume/${resume._id}/preview`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        {t("resumeHistory.openResume")}
                      </Link>
                    </div>

                    <div className="mt-5 grid gap-3">
                      {[...(resume.versions || [])]
                        .sort((a, b) => b.versionNumber - a.versionNumber)
                        .map((version) => {
                          const key = `${resume._id}-${version.versionNumber}`;

                          return (
                            <div
                              key={version.versionNumber}
                              className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium text-gray-900">
                                    {t("resumeHistory.version")}{" "}
                                    {version.versionNumber}
                                  </p>

                                  {version.versionNumber ===
                                    resume.currentVersion && (
                                    <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                                      {t("resumeHistory.latest")}
                                    </span>
                                  )}
                                </div>

                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                                  <span>
                                    {t("resumeHistory.generatedAt")}:{" "}
                                    {formatDate(version.generatedAt)}
                                  </span>

                                  <span>
                                    {t("resumeHistory.template")}:{" "}
                                    {version.customization?.template || "-"}
                                  </span>

                                  <span>
                                    {t("resumeHistory.font")}:{" "}
                                    {version.customization?.font || "-"}
                                  </span>

                                  <span>
                                    {t("resumeHistory.downloads")}:{" "}
                                    {
                                      resume.downloadHistory.filter(
                                        (entry) =>
                                          entry.versionNumber ===
                                          version.versionNumber,
                                      ).length
                                    }
                                  </span>
                                </div>
                              </div>

                              <button
                                type="button"
                                disabled={downloadingKey === key}
                                onClick={() =>
                                  downloadVersion(
                                    resume._id,
                                    resume.title,
                                    version.versionNumber,
                                  )
                                }
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                              >
                                {downloadingKey === key ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}

                                {t("resumeHistory.download")}
                              </button>
                            </div>
                          );
                        })}
                    </div>

                    {resume.downloadHistory?.length > 0 && (
                      <div className="mt-5">
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                          <Clock3 className="h-4 w-4" />
                          {t("resumeHistory.downloadHistory")}
                        </h4>

                        <div className="mt-3 overflow-x-auto">
                          <table className="min-w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-gray-200 text-xs text-gray-500">
                                <th className="py-2 pr-4 font-medium">
                                  {t("resumeHistory.version")}
                                </th>

                                <th className="py-2 pr-4 font-medium">
                                  {t("resumeHistory.downloadedAt")}
                                </th>

                                <th className="py-2 pr-4 font-medium">
                                  {t("resumeHistory.ipAddress")}
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {[...(resume.downloadHistory || [])]
                                .sort(
                                  (a, b) =>
                                    new Date(b.downloadedAt).getTime() -
                                    new Date(a.downloadedAt).getTime(),
                                )
                                .map((entry, index) => (
                                  <tr
                                    key={`${entry.downloadedAt}-${index}`}
                                    className="border-b border-gray-100 last:border-0"
                                  >
                                    <td className="py-2 pr-4 text-gray-700">
                                      v{entry.versionNumber}
                                    </td>

                                    <td className="py-2 pr-4 text-gray-700">
                                      {formatDate(entry.downloadedAt)}
                                    </td>

                                    <td className="py-2 pr-4 text-gray-500">
                                      {entry.ipAddress || "-"}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mt-8 rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-6 py-5">
              <h2 className="text-lg font-semibold text-gray-900">
                {t("resumeHistory.paymentHistory")}
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {t("resumeHistory.paymentHistoryDescription")}
              </p>
            </div>

            {payments.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <ReceiptText className="mx-auto h-8 w-8 text-gray-300" />

                <p className="mt-3 text-sm text-gray-500">
                  {t("resumeHistory.noPayments")}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {payments.map((payment) => (
                  <div
                    key={payment._id}
                    className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-gray-900">
                          {payment.resume?.title ||
                            t("resumeBuilder.untitledResume")}
                        </h3>

                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${paymentStatusClass(
                            payment.status,
                          )}`}
                        >
                          {t(`resumeHistory.paymentStatus.${payment.status}`, {
                            defaultValue: payment.status,
                          })}
                        </span>

                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${generationStatusClass(
                            payment.generationStatus,
                          )}`}
                        >
                          {t(
                            `resumeHistory.generationStatus.${payment.generationStatus || "pending"}`,
                            {
                              defaultValue:
                                payment.generationStatus || "pending",
                            },
                          )}
                        </span>

                        {payment.testMode && (
                          <span className="rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700">
                            {t("resumeHistory.testMode")}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span>₹{(payment.amount / 100).toFixed(2)}</span>

                        {payment.versionNumber && (
                          <span>
                            {t("resumeHistory.version")} {payment.versionNumber}
                          </span>
                        )}

                        <span>
                          {t("resumeHistory.createdAt")}:{" "}
                          {formatDate(payment.createdAt)}
                        </span>

                        {payment.paidAt && (
                          <span>
                            {t("resumeHistory.paidAt")}:{" "}
                            {formatDate(payment.paidAt)}
                          </span>
                        )}
                      </div>

                      {payment.failureReason && (
                        <p className="mt-2 text-xs text-red-600">
                          {payment.failureReason}
                        </p>
                      )}
                    </div>

                    {payment.status === "paid" && payment.invoiceNumber && (
                      <button
                        type="button"
                        disabled={invoiceLoadingId === payment._id}
                        onClick={() => loadInvoice(payment._id)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        {invoiceLoadingId === payment._id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ReceiptText className="h-4 w-4" />
                        )}

                        {t("resumeHistory.viewInvoice")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {(invoice || invoiceError) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50">
                  <ReceiptText className="h-5 w-5 text-blue-600" />
                </div>

                <h2 className="mt-4 text-xl font-bold text-gray-900">
                  {t("resumeHistory.invoiceDetails")}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setInvoice(null);
                  setInvoiceError("");
                }}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {invoiceError ? (
              <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {invoiceError}
              </div>
            ) : invoice ? (
              <div className="mt-5">
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  {t("resumeHistory.paymentVerified")}
                </div>

                <div className="mt-5 divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {[
                    [t("resumeHistory.invoiceNumber"), invoice.invoiceNumber],
                    [t("resumeHistory.resume"), invoice.resumeTitle],
                    [t("resumeHistory.customer"), invoice.customerName],
                    [t("resumeBuilder.email"), invoice.customerEmail],
                    [
                      t("resumeHistory.amount"),
                      `₹${invoice.amountInRupees.toFixed(2)} ${invoice.currency}`,
                    ],
                    [
                      t("resumeHistory.version"),
                      invoice.versionNumber ? `v${invoice.versionNumber}` : "-",
                    ],
                    [t("resumeHistory.paymentId"), invoice.razorpayPaymentId],
                    [t("resumeHistory.orderId"), invoice.razorpayOrderId],
                    [t("resumeHistory.paidAt"), formatDate(invoice.paidAt)],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between sm:gap-5"
                    >
                      <span className="text-sm text-gray-500">{label}</span>

                      <span className="break-all text-sm font-medium text-gray-900 sm:text-right">
                        {value || "-"}
                      </span>
                    </div>
                  ))}
                </div>

                {invoice.testMode && (
                  <p className="mt-4 text-xs text-purple-600">
                    {t("resumeHistory.testInvoiceNote")}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
};

export default index;
