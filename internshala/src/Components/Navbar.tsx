import Link from "next/link";
import LanguageSelector from "./LanguageSelector";
import { Search, User, UsersRound } from "lucide-react";
import { auth } from "../firebase/firebase";
import { signOut } from "firebase/auth";
import { authenticatedFetch } from "@/utils/authenticatedFetch";
import { clearLoginSecurityStorage } from "@/utils/loginSession";
import { useSelector } from "react-redux";
import { selectuser } from "@/feature/userSlice";
import { useTranslation } from "react-i18next";

export const Navbar = () => {
  const user = useSelector(selectuser);
  const { t } = useTranslation();

  const handleLogout = async () => {
    try {
      const response = await authenticatedFetch(
        "https://internshala-78tb.onrender.com/api/login-security/logout",
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));

        console.error("Backend logout failed:", data.error || response.status);
      }
    } catch (error) {
      console.error("Backend logout request failed:", error);
    } finally {
      clearLoginSecurityStorage();

      try {
        await signOut(auth);
      } catch (error) {
        console.error("Firebase logout failed:", error);
      }
    }
  };

  return (
    <div className="relative">
      <nav className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex-shrink-0">
              <Link href="/" className="text-xl font-bold text-blue-600">
                <img src="/logo.png" alt="Internshala" className="h-16" />
              </Link>
            </div>

            <div className="hidden md:flex items-center space-x-8">
              <Link
                href="/internship"
                className="text-gray-700 hover:text-blue-600"
              >
                {t("navbar.internships")}
              </Link>

              <Link href="/job" className="text-gray-700 hover:text-blue-600">
                {t("navbar.jobs")}
              </Link>

              <div className="flex items-center bg-gray-100 rounded-full px-4 py-2">
                <Search size={16} className="text-gray-400" />

                <input
                  type="text"
                  placeholder={t("navbar.searchPlaceholder")}
                  className="ml-2 bg-transparent focus:outline-none text-sm w-48"
                />
              </div>
              {user && (
                <Link
                  href="/social"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
                >
                  <UsersRound size={17} />
                  <span>{t("navbar.social")}</span>
                </Link>
              )}
            </div>

            <div className="flex items-center gap-3">
              <LanguageSelector />

              {user ? (
                <div className="flex items-center gap-2">
                  <Link
                    href="/profile"
                    className="flex items-center justify-center"
                    aria-label={t("navbar.userPhoto")}
                  >
                    {user.photo ? (
                      <img
                        src={user.photo}
                        alt={user.name || t("navbar.userPhoto")}
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                        <User className="w-4 h-4 text-gray-500" />
                      </div>
                    )}
                  </Link>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    {t("navbar.logout")}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    href="/auth"
                    className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    {t("authPage.loginTab")} / {t("authPage.signupTab")}
                  </Link>

                  <Link
                    href="/adminlogin"
                    className="hidden xl:inline text-sm text-gray-600 hover:text-gray-800"
                  >
                    {t("navbar.admin")}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
};
