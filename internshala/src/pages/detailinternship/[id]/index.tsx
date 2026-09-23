import { selectuser } from "@/feature/userSlice";
import { getLocalizedContent } from "@/utils/getLocalizedContent";
import axios from "axios";
import {
  ArrowUpRight,
  Calendar,
  Clock,
  DollarSign,
  ExternalLink,
  MapPin,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

function index() {
  const { t, i18n } = useTranslation();

  const currentLanguage = i18n.resolvedLanguage || i18n.language;

  const router = useRouter();
  const { id } = router.query;

  const [internshipData, setInternship] = useState<any>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [coverLetter, setCoverLetter] = useState("");

  const [availability, setAvailability] = useState("");

  const user = useSelector(selectuser);

  useEffect(() => {
    if (!id) {
      return;
    }

    const fetchdata = async () => {
      try {
        const res = await axios.get(
          `https://internshala-78tb.onrender.com/api/internship/${id}`,
        );

        setInternship(res.data);
      } catch (error) {
        console.log(error);
      }
    };

    fetchdata();
  }, [id]);

  if (!internshipData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  const localizedInternship = getLocalizedContent(
    internshipData,
    currentLanguage,
  );

  const handlesubmitapplication = async () => {
    if (!coverLetter.trim()) {
      toast.error(t("application.coverLetterRequired"));
      return;
    }

    if (!availability) {
      toast.error(t("application.availabilityRequired"));
      return;
    }

    try {
      const applicationdata = {
        category: internshipData.category,
        company: internshipData.company,
        coverLetter,
        user,
        Application: id,
        availability,
      };

      await axios.post(
        "https://internshala-78tb.onrender.com/api/application",
        applicationdata,
      );

      toast.success(t("application.submitted"));

      router.push("/internship");
    } catch (error) {
      console.error(error);

      toast.error(t("application.submitFailed"));
    }
  };

  const availabilityOptions = [
    {
      value: "Yes, I am available to join immediately",
      label: t("application.availableImmediately"),
    },
    {
      value: "No, I am currently on notice period",
      label: t("application.onNoticePeriod"),
    },
    {
      value: "No, I will have to serve notice period",
      label: t("application.serveNoticePeriod"),
    },
    {
      value: "Other",
      label: t("application.other"),
    },
  ];

  const formatDate = (date: string) => {
    if (!date) {
      return "";
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return date;
    }

    return parsedDate.toLocaleDateString(currentLanguage, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formattedPerks = Array.isArray(localizedInternship.perks)
    ? localizedInternship.perks.join(", ")
    : localizedInternship.perks;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-6 border-b">
          <div className="flex items-center space-x-2 text-blue-600 mb-4">
            <ArrowUpRight className="h-5 w-5" />

            <span className="font-medium">
              {t("internship.activelyHiring")}
            </span>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {localizedInternship.title}
          </h1>

          <p className="text-lg text-gray-600 mb-4">
            {localizedInternship.company}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center space-x-2 text-gray-600">
              <MapPin className="h-5 w-5" />

              <span>{localizedInternship.location}</span>
            </div>

            <div className="flex items-center space-x-2 text-gray-600">
              <DollarSign className="h-5 w-5" />

              <span>{localizedInternship.stipend}</span>
            </div>

            <div className="flex items-center space-x-2 text-gray-600">
              <Calendar className="h-5 w-5" />

              <span>{formatDate(localizedInternship.startDate)}</span>
            </div>
          </div>

          <div className="mt-4 flex items-center space-x-2">
            <Clock className="h-4 w-4 text-green-500" />

            <span className="text-green-500 text-sm">
              {t("internship.postedOn", {
                date: formatDate(internshipData.createdAt),
              })}
            </span>
          </div>
        </div>

        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {t("internship.aboutCompany", {
              company: localizedInternship.company,
            })}
          </h2>

          <div className="flex items-center space-x-2 mb-4">
            <a
              href="#"
              className="text-blue-600 hover:text-blue-700 flex items-center space-x-1"
            >
              <span>{t("internship.visitWebsite")}</span>

              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <p className="text-gray-600">{localizedInternship.aboutCompany}</p>
        </div>

        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {t("internship.aboutInternship")}
          </h2>

          <p className="text-gray-600 mb-6">
            {localizedInternship.aboutInternship}
          </p>

          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t("internship.whoCanApply")}
          </h3>

          <p className="text-gray-600 mb-6">
            {localizedInternship.whoCanApply}
          </p>

          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t("internship.perks")}
          </h3>

          <p className="text-gray-600 mb-6">{formattedPerks}</p>

          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t("internship.additionalInfo")}
          </h3>

          <p className="text-gray-600 mb-6">
            {localizedInternship.additionalInfo}
          </p>

          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t("form.numberOfOpenings")}
          </h3>

          <p className="text-gray-600">{localizedInternship.numberOfOpening}</p>
        </div>

        <div className="p-6 flex justify-center">
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition duration-150"
          >
            {t("application.applyNow")}
          </button>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">
                  {t("application.applyTo", {
                    company: localizedInternship.company,
                  })}
                </h2>

                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {t("application.yourResume")}
                </h3>

                <p className="text-gray-600">{t("application.resumeNote")}</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {t("application.coverLetter")}
                </h3>

                <p className="text-gray-600 mb-2">
                  {t("application.whySelectedInternship")}
                </p>

                <textarea
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  className="w-full h-32 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 text-black"
                  placeholder={t("application.coverLetterPlaceholder")}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {t("application.yourAvailability")}
                </h3>

                <div className="space-y-3">
                  {availabilityOptions.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center space-x-2"
                    >
                      <input
                        type="radio"
                        name="availability"
                        value={option.value}
                        checked={availability === option.value}
                        onChange={(e) => setAvailability(e.target.value)}
                        className="h-4 w-4 text-blue-600"
                      />

                      <span className="text-gray-700">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                {user ? (
                  <button
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                    onClick={handlesubmitapplication}
                  >
                    {t("application.submitApplication")}
                  </button>
                ) : (
                  <Link
                    href="/"
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                  >
                    {t("application.signUpToApply")}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default index;
