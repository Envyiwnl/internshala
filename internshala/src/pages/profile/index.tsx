import {
  ExternalLink,
  FileText,
  Mail,
  User,
  ArrowRight,
  Crown,
} from "lucide-react";
import Link from "next/link";
import { useSelector } from "react-redux";
import { selectuser } from "@/feature/userSlice";
import LanguageHistory from "@/Components/LanguageHistory";
import { useTranslation } from "react-i18next";

const index = () => {
  const { t } = useTranslation();
  const user = useSelector(selectuser);

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="relative h-32 bg-gradient-to-r from-blue-500 to-blue-600">
            <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2">
              {user?.photo ? (
                <img
                  src={user.photo}
                  alt={user.name}
                  className="w-24 h-24 rounded-full border-4 border-white shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg bg-gray-200 flex items-center justify-center">
                  <User className="h-12 w-12 text-gray-400" />
                </div>
              )}
            </div>
          </div>

          <div className="pt-16 pb-8 px-6">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900">{user?.name}</h1>

              <div className="mt-2 flex items-center justify-center text-gray-500">
                <Mail className="h-4 w-4 mr-2" />
                <span>{user?.email}</span>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <span className="text-blue-600 font-semibold text-2xl">
                    0
                  </span>

                  <p className="text-blue-600 text-sm mt-1">
                    {t("profile.activeApplications")}
                  </p>
                </div>

                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <span className="text-green-600 font-semibold text-2xl">
                    0
                  </span>

                  <p className="text-green-600 text-sm mt-1">
                    {t("profile.acceptedApplications")}
                  </p>
                </div>
              </div>

              <div className="border border-blue-100 bg-blue-50/50 rounded-xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 shrink-0 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                      <FileText className="h-6 w-6" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-gray-900">
                          {t("resumeBuilder.title")}
                        </h2>

                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                          <Crown className="h-3 w-3" />
                          {t("resumeBuilder.premium")}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-gray-600">
                        {t("resumeBuilder.description")}
                      </p>
                    </div>
                  </div>

                  <Link
                    href="/profile/resume"
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    {t("resumeBuilder.myResumes")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <div className="flex justify-center pt-4">
                <Link
                  href="/userapplication"
                  className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors duration-200"
                >
                  {t("profile.viewApplications")}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </div>

              <LanguageHistory />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default index;
