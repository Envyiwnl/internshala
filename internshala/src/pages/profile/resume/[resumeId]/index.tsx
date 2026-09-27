import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { selectuser } from "@/feature/userSlice";

const API_URL = "https://internshala-78tb.onrender.com";

type Education = {
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startDate: string;
  endDate: string;
  grade: string;
  description: string;
};

type WorkExperience = {
  company: string;
  position: string;
  location: string;
  startDate: string;
  endDate: string;
  currentlyWorking: boolean;
  description: string;
};

type Internship = {
  company: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string;
  description: string;
};

type Project = {
  title: string;
  description: string;
  technologies: string[];
  projectUrl: string;
  githubUrl: string;
};

type Certification = {
  name: string;
  organization: string;
  issueDate: string;
  credentialId: string;
  credentialUrl: string;
};

type Language = {
  name: string;
  proficiency: string;
};

type SocialLink = {
  platform: string;
  url: string;
};

type Reference = {
  name: string;
  designation: string;
  company: string;
  email: string;
  phone: string;
};

type ResumeContent = {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  profilePhoto: string;
  careerObjective: string;
  education: Education[];
  skills: string[];
  workExperience: WorkExperience[];
  internships: Internship[];
  projects: Project[];
  certifications: Certification[];
  achievements: string[];
  languages: Language[];
  socialLinks: SocialLink[];
  references: Reference[];
};

type Customization = {
  template: "classic" | "modern" | "minimal";
  color: string;
  font: "Arial" | "Helvetica" | "Times New Roman" | "Georgia";
};

type ArraySection =
  | "education"
  | "workExperience"
  | "internships"
  | "projects"
  | "certifications"
  | "languages"
  | "socialLinks"
  | "references";

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
};

const createInitialContent = (): ResumeContent => ({
  fullName: "",
  email: "",
  phone: "",
  address: "",
  profilePhoto: "",
  careerObjective: "",
  education: [],
  skills: [],
  workExperience: [],
  internships: [],
  projects: [],
  certifications: [],
  achievements: [],
  languages: [],
  socialLinks: [],
  references: [],
});

const defaultCustomization: Customization = {
  template: "classic",
  color: "#2563EB",
  font: "Arial",
};

const factories: Record<ArraySection, () => any> = {
  education: () => ({
    institution: "",
    degree: "",
    fieldOfStudy: "",
    startDate: "",
    endDate: "",
    grade: "",
    description: "",
  }),

  workExperience: () => ({
    company: "",
    position: "",
    location: "",
    startDate: "",
    endDate: "",
    currentlyWorking: false,
    description: "",
  }),

  internships: () => ({
    company: "",
    role: "",
    location: "",
    startDate: "",
    endDate: "",
    description: "",
  }),

  projects: () => ({
    title: "",
    description: "",
    technologies: [],
    projectUrl: "",
    githubUrl: "",
  }),

  certifications: () => ({
    name: "",
    organization: "",
    issueDate: "",
    credentialId: "",
    credentialUrl: "",
  }),

  languages: () => ({
    name: "",
    proficiency: "",
  }),

  socialLinks: () => ({
    platform: "",
    url: "",
  }),

  references: () => ({
    name: "",
    designation: "",
    company: "",
    email: "",
    phone: "",
  }),
};

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100 disabled:text-gray-500";

const Field = ({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  disabled = false,
}: FieldProps) => {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        {label}
      </label>

      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </div>
  );
};

const TextArea = ({ label, value, onChange, placeholder = "" }: FieldProps) => {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        {label}
      </label>

      <textarea
        rows={4}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} resize-none`}
      />
    </div>
  );
};

const index = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useSelector(selectuser);

  const resumeId =
    typeof router.query.resumeId === "string" ? router.query.resumeId : "";

  const [title, setTitle] = useState("");
  const [content, setContent] = useState<ResumeContent>(createInitialContent());
  const [customization, setCustomization] =
    useState<Customization>(defaultCustomization);

  const [includeProfilePhoto, setIncludeProfilePhoto] = useState(false);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady || !resumeId) {
      return;
    }

    const auth = getAuth();
    const controller = new AbortController();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setError(t("resumeBuilder.authenticationRequired"));
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const token = await firebaseUser.getIdToken();

        const response = await fetch(`${API_URL}/api/resume/${resumeId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        const data = await response.json();

        if (response.status === 403 && data.error === "PREMIUM_REQUIRED") {
          setError(t("resumeBuilder.premiumRequiredDescription"));
          return;
        }

        if (!response.ok) {
          throw new Error(data.error || "RESUME_FETCH_FAILED");
        }

        const resume = data.resume;
        const resumeContent = resume?.content || {};

        setTitle(resume?.title || "");

        setContent({
          ...createInitialContent(),
          ...resumeContent,
          education: Array.isArray(resumeContent.education)
            ? resumeContent.education
            : [],
          skills: Array.isArray(resumeContent.skills)
            ? resumeContent.skills
            : [],
          workExperience: Array.isArray(resumeContent.workExperience)
            ? resumeContent.workExperience
            : [],
          internships: Array.isArray(resumeContent.internships)
            ? resumeContent.internships
            : [],
          projects: Array.isArray(resumeContent.projects)
            ? resumeContent.projects
            : [],
          certifications: Array.isArray(resumeContent.certifications)
            ? resumeContent.certifications
            : [],
          achievements: Array.isArray(resumeContent.achievements)
            ? resumeContent.achievements
            : [],
          languages: Array.isArray(resumeContent.languages)
            ? resumeContent.languages
            : [],
          socialLinks: Array.isArray(resumeContent.socialLinks)
            ? resumeContent.socialLinks
            : [],
          references: Array.isArray(resumeContent.references)
            ? resumeContent.references
            : [],
        });

        setCustomization({
          ...defaultCustomization,
          ...(resume?.customization || {}),
        });

        setIncludeProfilePhoto(Boolean(resumeContent.profilePhoto));
      } catch (error: any) {
        if (error?.name === "AbortError") {
          return;
        }

        console.error("Resume loading failed:", error);

        setError(t("resumeEditor.loadError"));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    });

    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [router.isReady, resumeId, t]);

  const markChanged = () => {
    setSaved(false);

    if (error) {
      setError("");
    }
  };

  const updateContentField = (field: keyof ResumeContent, value: any) => {
    setContent((prev) => ({
      ...prev,
      [field]: value,
    }));

    markChanged();
  };

  const updateArrayItem = (
    section: ArraySection,
    index: number,
    field: string,
    value: any,
  ) => {
    setContent((prev: any) => ({
      ...prev,
      [section]: prev[section].map((item: any, itemIndex: number) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    }));

    markChanged();
  };

  const addItem = (section: ArraySection) => {
    setContent((prev: any) => ({
      ...prev,
      [section]: [...prev[section], factories[section]()],
    }));

    markChanged();
  };

  const removeItem = (section: ArraySection, index: number) => {
    setContent((prev: any) => ({
      ...prev,
      [section]: prev[section].filter(
        (_: any, itemIndex: number) => itemIndex !== index,
      ),
    }));

    markChanged();
  };

  const handleProfilePhotoChange = (checked: boolean) => {
    setIncludeProfilePhoto(checked);

    setContent((prev) => ({
      ...prev,
      profilePhoto: checked ? prev.profilePhoto || user?.photo || "" : "",
    }));

    setPhotoError("");
    markChanged();
  };

  const handleProfilePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png"];

    if (!allowedTypes.includes(file.type)) {
      setPhotoError(t("resumeEditor.invalidPhotoType"));

      e.target.value = "";
      return;
    }

    const maxSize = 2 * 1024 * 1024;

    if (file.size > maxSize) {
      setPhotoError(t("resumeEditor.photoTooLarge"));

      e.target.value = "";
      return;
    }

    try {
      setUploadingPhoto(true);
      setPhotoError("");

      const firebaseUser = getAuth().currentUser;

      if (!firebaseUser) {
        throw new Error("AUTHENTICATION_REQUIRED");
      }

      const storage = getStorage();

      const photoRef = ref(
        storage,
        `resume-profile-photos/${firebaseUser.uid}/${resumeId}/profile-photo`,
      );

      await uploadBytes(photoRef, file, {
        contentType: file.type,
        customMetadata: {
          originalName: file.name,
          resumeId,
        },
      });

      const photoUrl = await getDownloadURL(photoRef);

      setContent((prev) => ({
        ...prev,
        profilePhoto: photoUrl,
      }));

      setIncludeProfilePhoto(true);
      markChanged();
    } catch (error) {
      console.error("Resume profile photo upload failed:", error);

      setPhotoError(t("resumeEditor.photoUploadFailed"));
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const validateForPreview = () => {
    const hasEducation = content.education.some(
      (item) => item.institution?.trim() && item.degree?.trim(),
    );

    const hasSkills = content.skills.some((skill) => skill.trim());

    if (
      !content.fullName.trim() ||
      !content.email.trim() ||
      !content.phone.trim() ||
      !content.careerObjective.trim() ||
      !hasEducation ||
      !hasSkills
    ) {
      setError(t("resumeEditor.previewRequirements"));

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });

      return false;
    }

    return true;
  };

  const saveResume = async (goToPreview = false) => {
    if (saving) {
      return;
    }

    if (goToPreview && !validateForPreview()) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSaved(false);

      const firebaseUser = getAuth().currentUser;

      if (!firebaseUser) {
        setError(t("resumeBuilder.authenticationRequired"));
        return;
      }

      const token = await firebaseUser.getIdToken();

      const finalContent = {
        ...content,
        profilePhoto: includeProfilePhoto
          ? content.profilePhoto || user?.photo || ""
          : "",
        skills: content.skills.map((skill) => skill.trim()).filter(Boolean),
        achievements: content.achievements
          .map((item) => item.trim())
          .filter(Boolean),
      };

      const response = await fetch(`${API_URL}/api/resume/${resumeId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim() || t("resumeBuilder.defaultResumeTitle"),
          content: finalContent,
          customization,
        }),
      });

      const data = await response.json();

      if (response.status === 403 && data.error === "PREMIUM_REQUIRED") {
        setError(t("resumeBuilder.premiumRequiredDescription"));
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "RESUME_UPDATE_FAILED");
      }

      setContent(finalContent);
      setSaved(true);

      if (goToPreview) {
        await router.push(`/profile/resume/${resumeId}/preview`);
      }
    } catch (error) {
      console.error("Resume save failed:", error);

      setError(t("resumeEditor.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    saveResume(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />

          <p className="mt-3 text-sm text-gray-500">
            {t("resumeEditor.loading")}
          </p>
        </div>
      </div>
    );
  }

  const photoSource = content.profilePhoto || user?.photo || "";

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          href="/profile/resume"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-blue-600"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("resumeBuilder.backToResumes")}
        </Link>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              {t("resumeEditor.title")}
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              {t("resumeEditor.description")}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => saveResume(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}

              {t("resumeEditor.saveDraft")}
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => saveResume(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {t("resumeEditor.savePreview")}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {saved && (
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <Check className="h-4 w-4" />
            {t("resumeEditor.saved")}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-8">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <User className="h-5 w-5 text-blue-600" />
              </div>

              <h2 className="text-lg font-semibold text-gray-900">
                {t("resumeBuilder.basicInformation")}
              </h2>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label={t("resumeBuilder.resumeTitle")}
                value={title}
                onChange={(value) => {
                  setTitle(value);
                  markChanged();
                }}
              />

              <Field
                label={t("resumeBuilder.fullName")}
                value={content.fullName}
                onChange={(value) => updateContentField("fullName", value)}
              />

              <Field
                label={t("resumeBuilder.email")}
                type="email"
                value={content.email}
                onChange={(value) => updateContentField("email", value)}
              />

              <Field
                label={t("resumeBuilder.phone")}
                type="tel"
                value={content.phone}
                onChange={(value) => updateContentField("phone", value)}
              />

              <div className="sm:col-span-2">
                <Field
                  label={t("resumeBuilder.address")}
                  value={content.address}
                  onChange={(value) => updateContentField("address", value)}
                />
              </div>

              <div className="sm:col-span-2">
                <TextArea
                  label={t("resumeBuilder.careerObjective")}
                  value={content.careerObjective}
                  onChange={(value) =>
                    updateContentField("careerObjective", value)
                  }
                />
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                  <ImagePlus className="h-5 w-5 text-blue-600" />
                </div>

                <div>
                  <p className="font-medium text-gray-900">
                    {t("resumeEditor.profilePhoto")}
                  </p>

                  <p className="mt-1 text-sm text-gray-500">
                    {t("resumeEditor.profilePhotoUploadDescription")}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
                {photoSource ? (
                  <img
                    src={photoSource}
                    alt={content.fullName || ""}
                    className="h-24 w-24 shrink-0 rounded-xl border border-gray-200 object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
                    <User className="h-9 w-9 text-gray-300" />
                  </div>
                )}

                <div className="flex-1">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-medium text-blue-600 transition hover:bg-blue-50">
                    {uploadingPhoto ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}

                    {uploadingPhoto
                      ? t("resumeEditor.uploadingPhoto")
                      : photoSource
                        ? t("resumeEditor.changePhoto")
                        : t("resumeEditor.uploadPhoto")}

                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      disabled={uploadingPhoto}
                      onChange={handleProfilePhotoUpload}
                      className="hidden"
                    />
                  </label>

                  <p className="mt-2 text-xs text-gray-500">
                    {t("resumeEditor.photoRequirements")}
                  </p>

                  {photoError && (
                    <p className="mt-2 text-sm text-red-600">{photoError}</p>
                  )}

                  {photoSource && (
                    <label className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                      <input
                        type="checkbox"
                        checked={includeProfilePhoto}
                        onChange={(e) =>
                          handleProfilePhotoChange(e.target.checked)
                        }
                        className="h-4 w-4 rounded border-gray-300"
                      />

                      {t("resumeEditor.includePhoto")}
                    </label>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              {t("resumeEditor.skills")}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {t("resumeEditor.skillsHint")}
            </p>

            <input
              value={content.skills.join(", ")}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                updateContentField(
                  "skills",
                  e.target.value.split(",").map((item) => item.trim()),
                )
              }
              placeholder={t("resumeEditor.skillsPlaceholder")}
              className={`${inputClass} mt-4`}
            />
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {t("resumeEditor.education")}
              </h2>

              <button
                type="button"
                onClick={() => addItem("education")}
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600"
              >
                <Plus className="h-4 w-4" />
                {t("resumeEditor.addEducation")}
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {content.education.map((item, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-gray-200 p-5"
                >
                  <div className="mb-5 flex items-center justify-between">
                    <p className="font-medium text-gray-900">
                      {t("resumeEditor.education")} {index + 1}
                    </p>

                    <button
                      type="button"
                      onClick={() => removeItem("education", index)}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label={t("resumeEditor.institution")}
                      value={item.institution}
                      onChange={(value) =>
                        updateArrayItem(
                          "education",
                          index,
                          "institution",
                          value,
                        )
                      }
                    />

                    <Field
                      label={t("resumeEditor.degree")}
                      value={item.degree}
                      onChange={(value) =>
                        updateArrayItem("education", index, "degree", value)
                      }
                    />

                    <Field
                      label={t("resumeEditor.fieldOfStudy")}
                      value={item.fieldOfStudy}
                      onChange={(value) =>
                        updateArrayItem(
                          "education",
                          index,
                          "fieldOfStudy",
                          value,
                        )
                      }
                    />

                    <Field
                      label={t("resumeEditor.grade")}
                      value={item.grade}
                      onChange={(value) =>
                        updateArrayItem("education", index, "grade", value)
                      }
                    />

                    <Field
                      label={t("resumeEditor.startDate")}
                      type="month"
                      value={item.startDate}
                      onChange={(value) =>
                        updateArrayItem("education", index, "startDate", value)
                      }
                    />

                    <Field
                      label={t("resumeEditor.endDate")}
                      type="month"
                      value={item.endDate}
                      onChange={(value) =>
                        updateArrayItem("education", index, "endDate", value)
                      }
                    />

                    <div className="sm:col-span-2">
                      <TextArea
                        label={t("resumeEditor.descriptionField")}
                        value={item.description}
                        onChange={(value) =>
                          updateArrayItem(
                            "education",
                            index,
                            "description",
                            value,
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {t("resumeEditor.workExperience")}
              </h2>

              <button
                type="button"
                onClick={() => addItem("workExperience")}
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600"
              >
                <Plus className="h-4 w-4" />
                {t("resumeEditor.addExperience")}
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {content.workExperience.map((item, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-gray-200 p-5"
                >
                  <div className="mb-5 flex items-center justify-between">
                    <p className="font-medium text-gray-900">
                      {t("resumeEditor.workExperience")} {index + 1}
                    </p>

                    <button
                      type="button"
                      onClick={() => removeItem("workExperience", index)}
                      className="text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label={t("resumeEditor.company")}
                      value={item.company}
                      onChange={(value) =>
                        updateArrayItem(
                          "workExperience",
                          index,
                          "company",
                          value,
                        )
                      }
                    />

                    <Field
                      label={t("resumeEditor.position")}
                      value={item.position}
                      onChange={(value) =>
                        updateArrayItem(
                          "workExperience",
                          index,
                          "position",
                          value,
                        )
                      }
                    />

                    <Field
                      label={t("resumeEditor.location")}
                      value={item.location}
                      onChange={(value) =>
                        updateArrayItem(
                          "workExperience",
                          index,
                          "location",
                          value,
                        )
                      }
                    />

                    <div />

                    <Field
                      label={t("resumeEditor.startDate")}
                      type="month"
                      value={item.startDate}
                      onChange={(value) =>
                        updateArrayItem(
                          "workExperience",
                          index,
                          "startDate",
                          value,
                        )
                      }
                    />

                    <Field
                      label={t("resumeEditor.endDate")}
                      type="month"
                      disabled={item.currentlyWorking}
                      value={item.endDate}
                      onChange={(value) =>
                        updateArrayItem(
                          "workExperience",
                          index,
                          "endDate",
                          value,
                        )
                      }
                    />

                    <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={item.currentlyWorking}
                        onChange={(e) => {
                          updateArrayItem(
                            "workExperience",
                            index,
                            "currentlyWorking",
                            e.target.checked,
                          );

                          if (e.target.checked) {
                            updateArrayItem(
                              "workExperience",
                              index,
                              "endDate",
                              "",
                            );
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />

                      {t("resumeEditor.currentlyWorking")}
                    </label>

                    <div className="sm:col-span-2">
                      <TextArea
                        label={t("resumeEditor.descriptionField")}
                        value={item.description}
                        onChange={(value) =>
                          updateArrayItem(
                            "workExperience",
                            index,
                            "description",
                            value,
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {t("resumeEditor.internships")}
              </h2>

              <button
                type="button"
                onClick={() => addItem("internships")}
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600"
              >
                <Plus className="h-4 w-4" />
                {t("resumeEditor.addInternship")}
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {content.internships.map((item, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-gray-200 p-5"
                >
                  <div className="mb-5 flex justify-between">
                    <p className="font-medium text-gray-900">
                      {t("resumeEditor.internships")} {index + 1}
                    </p>

                    <button
                      type="button"
                      onClick={() => removeItem("internships", index)}
                      className="text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label={t("resumeEditor.company")}
                      value={item.company}
                      onChange={(value) =>
                        updateArrayItem("internships", index, "company", value)
                      }
                    />

                    <Field
                      label={t("resumeEditor.role")}
                      value={item.role}
                      onChange={(value) =>
                        updateArrayItem("internships", index, "role", value)
                      }
                    />

                    <Field
                      label={t("resumeEditor.location")}
                      value={item.location}
                      onChange={(value) =>
                        updateArrayItem("internships", index, "location", value)
                      }
                    />

                    <div />

                    <Field
                      label={t("resumeEditor.startDate")}
                      type="month"
                      value={item.startDate}
                      onChange={(value) =>
                        updateArrayItem(
                          "internships",
                          index,
                          "startDate",
                          value,
                        )
                      }
                    />

                    <Field
                      label={t("resumeEditor.endDate")}
                      type="month"
                      value={item.endDate}
                      onChange={(value) =>
                        updateArrayItem("internships", index, "endDate", value)
                      }
                    />

                    <div className="sm:col-span-2">
                      <TextArea
                        label={t("resumeEditor.descriptionField")}
                        value={item.description}
                        onChange={(value) =>
                          updateArrayItem(
                            "internships",
                            index,
                            "description",
                            value,
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {t("resumeEditor.projects")}
              </h2>

              <button
                type="button"
                onClick={() => addItem("projects")}
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600"
              >
                <Plus className="h-4 w-4" />
                {t("resumeEditor.addProject")}
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {content.projects.map((item, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-gray-200 p-5"
                >
                  <div className="mb-5 flex justify-between">
                    <p className="font-medium text-gray-900">
                      {t("resumeEditor.projects")} {index + 1}
                    </p>

                    <button
                      type="button"
                      onClick={() => removeItem("projects", index)}
                      className="text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label={t("resumeEditor.projectTitle")}
                      value={item.title}
                      onChange={(value) =>
                        updateArrayItem("projects", index, "title", value)
                      }
                    />

                    <Field
                      label={t("resumeEditor.technologies")}
                      value={item.technologies.join(", ")}
                      onChange={(value) =>
                        updateArrayItem(
                          "projects",
                          index,
                          "technologies",
                          value.split(",").map((item) => item.trim()),
                        )
                      }
                    />

                    <Field
                      label={t("resumeEditor.projectUrl")}
                      type="url"
                      value={item.projectUrl}
                      onChange={(value) =>
                        updateArrayItem("projects", index, "projectUrl", value)
                      }
                    />

                    <Field
                      label={t("resumeEditor.githubUrl")}
                      type="url"
                      value={item.githubUrl}
                      onChange={(value) =>
                        updateArrayItem("projects", index, "githubUrl", value)
                      }
                    />

                    <div className="sm:col-span-2">
                      <TextArea
                        label={t("resumeEditor.descriptionField")}
                        value={item.description}
                        onChange={(value) =>
                          updateArrayItem(
                            "projects",
                            index,
                            "description",
                            value,
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {t("resumeEditor.certifications")}
              </h2>

              <button
                type="button"
                onClick={() => addItem("certifications")}
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600"
              >
                <Plus className="h-4 w-4" />
                {t("resumeEditor.addCertification")}
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {content.certifications.map((item, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-gray-200 p-5"
                >
                  <div className="mb-5 flex justify-between">
                    <p className="font-medium text-gray-900">
                      {t("resumeEditor.certifications")} {index + 1}
                    </p>

                    <button
                      type="button"
                      onClick={() => removeItem("certifications", index)}
                      className="text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label={t("resumeEditor.certificationName")}
                      value={item.name}
                      onChange={(value) =>
                        updateArrayItem("certifications", index, "name", value)
                      }
                    />

                    <Field
                      label={t("resumeEditor.organization")}
                      value={item.organization}
                      onChange={(value) =>
                        updateArrayItem(
                          "certifications",
                          index,
                          "organization",
                          value,
                        )
                      }
                    />

                    <Field
                      label={t("resumeEditor.issueDate")}
                      type="month"
                      value={item.issueDate}
                      onChange={(value) =>
                        updateArrayItem(
                          "certifications",
                          index,
                          "issueDate",
                          value,
                        )
                      }
                    />

                    <Field
                      label={t("resumeEditor.credentialId")}
                      value={item.credentialId}
                      onChange={(value) =>
                        updateArrayItem(
                          "certifications",
                          index,
                          "credentialId",
                          value,
                        )
                      }
                    />

                    <div className="sm:col-span-2">
                      <Field
                        label={t("resumeEditor.credentialUrl")}
                        type="url"
                        value={item.credentialUrl}
                        onChange={(value) =>
                          updateArrayItem(
                            "certifications",
                            index,
                            "credentialUrl",
                            value,
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              {t("resumeEditor.achievements")}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {t("resumeEditor.achievementsHint")}
            </p>

            <textarea
              rows={5}
              value={content.achievements.join("\n")}
              onChange={(e) =>
                updateContentField("achievements", e.target.value.split("\n"))
              }
              className={`${inputClass} mt-4 resize-none`}
            />
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {t("resumeEditor.languages")}
              </h2>

              <button
                type="button"
                onClick={() => addItem("languages")}
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600"
              >
                <Plus className="h-4 w-4" />
                {t("resumeEditor.addLanguage")}
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {content.languages.map((item, index) => (
                <div
                  key={index}
                  className="grid gap-4 rounded-xl border border-gray-200 p-4 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <Field
                    label={t("resumeEditor.languageName")}
                    value={item.name}
                    onChange={(value) =>
                      updateArrayItem("languages", index, "name", value)
                    }
                  />

                  <Field
                    label={t("resumeEditor.proficiency")}
                    value={item.proficiency}
                    onChange={(value) =>
                      updateArrayItem("languages", index, "proficiency", value)
                    }
                  />

                  <button
                    type="button"
                    onClick={() => removeItem("languages", index)}
                    className="self-end rounded-lg p-3 text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {t("resumeEditor.socialLinks")}
              </h2>

              <button
                type="button"
                onClick={() => addItem("socialLinks")}
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600"
              >
                <Plus className="h-4 w-4" />
                {t("resumeEditor.addSocialLink")}
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {content.socialLinks.map((item, index) => (
                <div
                  key={index}
                  className="grid gap-4 rounded-xl border border-gray-200 p-4 sm:grid-cols-[1fr_2fr_auto]"
                >
                  <Field
                    label={t("resumeEditor.platform")}
                    value={item.platform}
                    onChange={(value) =>
                      updateArrayItem("socialLinks", index, "platform", value)
                    }
                  />

                  <Field
                    label={t("resumeEditor.url")}
                    type="url"
                    value={item.url}
                    onChange={(value) =>
                      updateArrayItem("socialLinks", index, "url", value)
                    }
                  />

                  <button
                    type="button"
                    onClick={() => removeItem("socialLinks", index)}
                    className="self-end rounded-lg p-3 text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {t("resumeEditor.references")}
              </h2>

              <button
                type="button"
                onClick={() => addItem("references")}
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600"
              >
                <Plus className="h-4 w-4" />
                {t("resumeEditor.addReference")}
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {content.references.map((item, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-gray-200 p-5"
                >
                  <div className="mb-5 flex justify-between">
                    <p className="font-medium text-gray-900">
                      {t("resumeEditor.references")} {index + 1}
                    </p>

                    <button
                      type="button"
                      onClick={() => removeItem("references", index)}
                      className="text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label={t("resumeEditor.referenceName")}
                      value={item.name}
                      onChange={(value) =>
                        updateArrayItem("references", index, "name", value)
                      }
                    />

                    <Field
                      label={t("resumeEditor.designation")}
                      value={item.designation}
                      onChange={(value) =>
                        updateArrayItem(
                          "references",
                          index,
                          "designation",
                          value,
                        )
                      }
                    />

                    <Field
                      label={t("resumeEditor.company")}
                      value={item.company}
                      onChange={(value) =>
                        updateArrayItem("references", index, "company", value)
                      }
                    />

                    <Field
                      label={t("resumeBuilder.email")}
                      type="email"
                      value={item.email}
                      onChange={(value) =>
                        updateArrayItem("references", index, "email", value)
                      }
                    />

                    <Field
                      label={t("resumeBuilder.phone")}
                      type="tel"
                      value={item.phone}
                      onChange={(value) =>
                        updateArrayItem("references", index, "phone", value)
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {t("resumeEditor.customization")}
                </h2>

                <p className="text-sm text-gray-500">
                  {t("resumeEditor.customizationDescription")}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <p className="mb-3 text-sm font-medium text-gray-700">
                {t("resumeEditor.template")}
              </p>

              <div className="grid gap-4 sm:grid-cols-3">
                {["classic", "modern", "minimal"].map((template) => {
                  const selected = customization.template === template;

                  return (
                    <button
                      key={template}
                      type="button"
                      onClick={() => {
                        setCustomization((prev) => ({
                          ...prev,
                          template: template as Customization["template"],
                        }));

                        markChanged();
                      }}
                      className={`rounded-xl border p-5 text-left transition ${
                        selected
                          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div
                        className="mb-4 h-24 rounded-lg border bg-white p-3"
                        style={{
                          borderTopColor: customization.color,
                          borderTopWidth: template === "modern" ? 18 : 4,
                        }}
                      >
                        <div className="h-2 w-2/3 rounded bg-gray-300" />
                        <div className="mt-2 h-1.5 w-full rounded bg-gray-200" />
                        <div className="mt-1 h-1.5 w-4/5 rounded bg-gray-200" />
                      </div>

                      <p className="font-medium capitalize text-gray-900">
                        {t(`resumeEditor.${template}`)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {t("resumeEditor.color")}
                </label>

                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={customization.color}
                    onChange={(e) => {
                      setCustomization((prev) => ({
                        ...prev,
                        color: e.target.value,
                      }));

                      markChanged();
                    }}
                    className="h-11 w-16 cursor-pointer rounded border border-gray-300 bg-white p-1"
                  />

                  <input
                    type="text"
                    value={customization.color}
                    onChange={(e) => {
                      setCustomization((prev) => ({
                        ...prev,
                        color: e.target.value,
                      }));

                      markChanged();
                    }}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {t("resumeEditor.font")}
                </label>

                <select
                  value={customization.font}
                  onChange={(e) => {
                    setCustomization((prev) => ({
                      ...prev,
                      font: e.target.value as Customization["font"],
                    }));

                    markChanged();
                  }}
                  className={inputClass}
                >
                  <option value="Arial">Arial</option>
                  <option value="Helvetica">Helvetica</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Georgia">Georgia</option>
                </select>
              </div>
            </div>
          </section>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}

              {t("resumeEditor.saveDraft")}
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => saveResume(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {t("resumeEditor.savePreview")}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default index;
