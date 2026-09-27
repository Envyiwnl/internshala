import {
  ArrowLeft,
  CheckCircle2,
  Crown,
  FilePlus2,
  FileText,
  History,
  ReceiptText,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useTranslation } from "react-i18next";

const API_URL = "https://internshala-78tb.onrender.com";

const index = () => {
  const { t, i18n } = useTranslation();

  const [resumes, setResumes] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(true);
  const [error, setError] = useState("");

  const [settingDefaultId, setSettingDefaultId] = useState("");
  const [defaultActionError, setDefaultActionError] = useState("");

  const loadResumeData = async (firebaseUser: any, signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError("");
      setDefaultActionError("");

      const token = await firebaseUser.getIdToken();

      const resumeResponse = await fetch(`${API_URL}/api/resume`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal,
      });

      const resumeData = await resumeResponse.json();

      if (
        resumeResponse.status === 403 &&
        resumeData.error === "PREMIUM_REQUIRED"
      ) {
        setIsPremium(false);
        setResumes([]);
        setPayments([]);
        return;
      }

      if (!resumeResponse.ok) {
        throw new Error(resumeData.error || "RESUME_LIST_FAILED");
      }

      setIsPremium(true);
      setResumes(resumeData.resumes || []);

      const paymentResponse = await fetch(`${API_URL}/api/resume/payments`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal,
      });

      const paymentData = await paymentResponse.json();

      if (!paymentResponse.ok) {
        throw new Error(paymentData.error || "PAYMENT_HISTORY_FETCH_FAILED");
      }

      setPayments(paymentData.payments || []);
    } catch (error: any) {
      if (error?.name === "AbortError") {
        return;
      }

      console.error("Resume dashboard fetch failed:", error);

      setError(error?.message || "RESUME_DASHBOARD_FETCH_FAILED");
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
        setError("AUTHENTICATION_REQUIRED");
        return;
      }

      await loadResumeData(firebaseUser, controller.signal);
    });

    return () => {
      controller.abort();
      unsubscribe();
    };
  }, []);

  const generatedVersions = useMemo(() => {
    return resumes.reduce(
      (total, resume) => total + (resume.versions?.length || 0),
      0,
    );
  }, [resumes]);

  const formatDate = (date: string) => {
    if (!date) {
      return "";
    }

    return new Date(date).toLocaleDateString(
      i18n.resolvedLanguage || i18n.language,
      {
        year: "numeric",
        month: "short",
        day: "numeric",
      },
    );
  };

  const handleRetry = async () => {
    const firebaseUser = getAuth().currentUser;

    if (!firebaseUser) {
      setError("AUTHENTICATION_REQUIRED");
      return;
    }

    await loadResumeData(firebaseUser);
  };

  const handleSetDefault = async (resumeId: string) => {
    const firebaseUser = getAuth().currentUser;

    if (!firebaseUser) {
      setDefaultActionError(t("resumeBuilder.authenticationRequired"));
      return;
    }

    try {
      setSettingDefaultId(resumeId);
      setDefaultActionError("");

      const token = await firebaseUser.getIdToken();

      const response = await fetch(
        `${API_URL}/api/resume/${resumeId}/default`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await response.json();

      if (response.status === 403 && data.error === "PREMIUM_REQUIRED") {
        setIsPremium(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "DEFAULT_RESUME_UPDATE_FAILED");
      }

      setResumes((prev) =>
        prev.map((resume) => ({
          ...resume,
          isDefault: resume._id === resumeId,
        })),
      );
    } catch (error) {
      console.error("Default resume update failed:", error);

      setDefaultActionError(t("resumeBuilder.defaultUpdateFailed"));
    } finally {
      setSettingDefaultId("");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-center">
              <RefreshCw className="mx-auto h-7 w-7 animate-spin text-blue-600" />

              <p className="mt-3 text-sm text-gray-500">
                {t("resumeBuilder.loading")}
              </p>
            </div>
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
            href="/profile"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-blue-600"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("resumeBuilder.backToProfile")}
          </Link>

          <div className="mt-8 rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <Crown className="h-7 w-7 text-amber-600" />
            </div>

            <h1 className="mt-5 text-2xl font-bold text-gray-900">
              {t("resumeBuilder.premiumRequiredTitle")}
            </h1>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-500">
              {t("resumeBuilder.premiumRequiredDescription")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-blue-600"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("resumeBuilder.backToProfile")}
          </Link>

          <div className="mt-8 rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold text-gray-900">
              {t("resumeBuilder.loadFailed")}
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              {t("resumeBuilder.loadFailedDescription")}
            </p>

            <button
              type="button"
              onClick={handleRetry}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" />
              {t("resumeBuilder.retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-blue-600"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("resumeBuilder.backToProfile")}
        </Link>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                {t("resumeBuilder.title")}
              </h1>

              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                <Crown className="h-3.5 w-3.5" />
                {t("resumeBuilder.premium")}
              </span>
            </div>

            <p className="mt-2 text-sm text-gray-500 sm:text-base">
              {t("resumeBuilder.description")}
            </p>
          </div>

          <Link
            href="/profile/resume/create"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            <FilePlus2 className="h-4 w-4" />
            {t("resumeBuilder.createResume")}
          </Link>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>

            <p className="mt-4 text-sm text-gray-500">
              {t("resumeBuilder.totalResumes")}
            </p>

            <p className="mt-1 text-2xl font-bold text-gray-900">
              {resumes.length}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
              <History className="h-5 w-5 text-green-600" />
            </div>

            <p className="mt-4 text-sm text-gray-500">
              {t("resumeBuilder.generatedVersions")}
            </p>

            <p className="mt-1 text-2xl font-bold text-gray-900">
              {generatedVersions}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
              <ReceiptText className="h-5 w-5 text-purple-600" />
            </div>

            <p className="mt-4 text-sm text-gray-500">
              {t("resumeBuilder.payments")}
            </p>

            <p className="mt-1 text-2xl font-bold text-gray-900">
              {payments.length}
            </p>
          </div>
        </div>

        {defaultActionError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {defaultActionError}
          </div>
        )}

        <div className="mt-8 rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-900">
              {t("resumeBuilder.myResumes")}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {t("resumeBuilder.myResumesDescription")}
            </p>
          </div>

          {resumes.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <FileText className="h-7 w-7 text-blue-600" />
              </div>

              <h3 className="mt-4 font-semibold text-gray-900">
                {t("resumeBuilder.noResumes")}
              </h3>

              <p className="mt-2 max-w-sm text-sm text-gray-500">
                {t("resumeBuilder.noResumesDescription")}
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/profile/resume/history"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <History className="h-4 w-4" />
                  {t("resumeBuilder.viewHistory")}
                </Link>

                <Link
                  href="/profile/resume/create"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <FilePlus2 className="h-4 w-4" />
                  {t("resumeBuilder.createResume")}
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {resumes.map((resume) => (
                <div
                  key={resume._id}
                  className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>

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

                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            resume.status === "generated"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {resume.status === "generated"
                            ? t("resumeBuilder.generated")
                            : t("resumeBuilder.draft")}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span>
                          {t("resumeBuilder.versions")}:{" "}
                          {resume.versions?.length || 0}
                        </span>

                        <span>
                          {t("resumeBuilder.updated")}:{" "}
                          {formatDate(resume.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <span className="text-sm font-medium text-gray-400">
                      v{resume.currentVersion || 0}
                    </span>

                    {resume.status === "generated" &&
                      (resume.versions?.length || 0) > 0 &&
                      !resume.isDefault && (
                        <button
                          type="button"
                          disabled={Boolean(settingDefaultId)}
                          onClick={() => handleSetDefault(resume._id)}
                          className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm font-medium text-green-700 transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {settingDefaultId === resume._id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}

                          {settingDefaultId === resume._id
                            ? t("resumeBuilder.settingDefault")
                            : t("resumeBuilder.setAsDefault")}
                        </button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default index;
