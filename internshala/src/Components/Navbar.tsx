import Link from "next/link";
import LanguageSelector from "./LanguageSelector";
import { Search, User } from "lucide-react";
import { auth, provider } from "../firebase/firebase";
import { signInWithPopup, signOut } from "firebase/auth";
import { toast } from "react-toastify";
import { useSelector } from "react-redux";
import { selectuser } from "@/feature/userSlice";
import { useTranslation } from "react-i18next";

export const Navbar = () => {
  const user = useSelector(selectuser);
  const { t } = useTranslation();

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);

      toast.success(t("navbar.loginSuccess"));
    } catch (error: any) {
      console.error("Google login failed:", error);

      if (error?.code === "auth/popup-closed-by-user") {
        return;
      }

      toast.error(t("navbar.loginFailed"));
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
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
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="bg-white border border-gray-300 rounded-lg px-4 py-2 flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />

                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />

                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />

                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>

                    <span className="hidden lg:inline text-sm text-gray-700">
                      {t("navbar.continueWithGoogle")}
                    </span>
                  </button>

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
