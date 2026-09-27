import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Loader2,
  Mail,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { getAuth } from "firebase/auth";
import { selectuser } from "@/feature/userSlice";

const API_URL = "https://internshala-78tb.onrender.com";

const index = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useSelector(selectuser);

  const [formData, setFormData] = useState({
    title: "",
    fullName: "",
    email: "",
    phone: "",
    address: "",
    careerObjective: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      fullName: prev.fullName || user?.name || "",
      email: prev.email || user?.email || "",
      phone: prev.phone || user?.phoneNumber || "",
    }));
  }, [user]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.fullName.trim() ||
      !formData.email.trim() ||
      !formData.phone.trim() ||
      !formData.careerObjective.trim()
    ) {
      setError(t("resumeBuilder.requiredFields"));
      return;
    }

    try {
      setSaving(true);
      setError("");

      const firebaseUser = getAuth().currentUser;

      if (!firebaseUser) {
        setError(t("resumeBuilder.authenticationRequired"));
        return;
      }

      const token = await firebaseUser.getIdToken();

      const response = await fetch(`${API_URL}/api/resume/draft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: formData.title.trim() || t("resumeBuilder.defaultResumeTitle"),
          content: {
            fullName: formData.fullName.trim(),
            email: formData.email.trim(),
            phone: formData.phone.trim(),
            address: formData.address.trim(),
            careerObjective: formData.careerObjective.trim(),
          },
        }),
      });

      const data = await response.json();

      if (response.status === 403 && data.error === "PREMIUM_REQUIRED") {
        setError(t("resumeBuilder.premiumRequiredDescription"));
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "RESUME_DRAFT_CREATION_FAILED");
      }

      if (!data.resume?._id) {
        throw new Error("RESUME_ID_MISSING");
      }

      await router.push(`/profile/resume/${data.resume._id}`);
    } catch (error) {
      console.error("Resume draft creation failed:", error);

      setError(t("resumeBuilder.draftCreationFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          href="/profile/resume"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-blue-600"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("resumeBuilder.backToResumes")}
        </Link>

        <div className="mt-6">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            {t("resumeBuilder.createResume")}
          </h1>

          <p className="mt-2 text-sm text-gray-500 sm:text-base">
            {t("resumeBuilder.createDescription")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                  <User className="h-5 w-5 text-blue-600" />
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {t("resumeBuilder.basicInformation")}
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    {t("resumeBuilder.basicInformationDescription")}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6 p-6">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="title"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  {t("resumeBuilder.resumeTitle")}
                </label>

                <div className="relative">
                  <BriefcaseBusiness className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                  <input
                    id="title"
                    name="title"
                    type="text"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder={t("resumeBuilder.resumeTitlePlaceholder")}
                    className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="fullName"
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    {t("resumeBuilder.fullName")}
                    <span className="text-red-500"> *</span>
                  </label>

                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      value={formData.fullName}
                      onChange={handleChange}
                      placeholder={t("resumeBuilder.fullNamePlaceholder")}
                      className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    {t("resumeBuilder.email")}
                    <span className="text-red-500"> *</span>
                  </label>

                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder={t("resumeBuilder.emailPlaceholder")}
                      className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="phone"
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    {t("resumeBuilder.phone")}
                    <span className="text-red-500"> *</span>
                  </label>

                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder={t("resumeBuilder.phonePlaceholder")}
                      className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="address"
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    {t("resumeBuilder.address")}
                  </label>

                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                    <input
                      id="address"
                      name="address"
                      type="text"
                      value={formData.address}
                      onChange={handleChange}
                      placeholder={t("resumeBuilder.addressPlaceholder")}
                      className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="careerObjective"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  {t("resumeBuilder.careerObjective")}
                  <span className="text-red-500"> *</span>
                </label>

                <textarea
                  id="careerObjective"
                  name="careerObjective"
                  value={formData.careerObjective}
                  onChange={handleChange}
                  rows={5}
                  placeholder={t("resumeBuilder.careerObjectivePlaceholder")}
                  className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />

                <p className="mt-2 text-xs text-gray-500">
                  {t("resumeBuilder.careerObjectiveHint")}
                </p>
              </div>
            </div>

            <div className="flex justify-end border-t border-gray-200 px-6 py-5">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("resumeBuilder.saving")}
                  </>
                ) : (
                  <>
                    {t("resumeBuilder.saveAndContinue")}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default index;
