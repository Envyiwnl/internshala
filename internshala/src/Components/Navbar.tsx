import Link from "next/link";
import LanguageSelector from "./LanguageSelector";
import { Menu, X, Search, User, UsersRound } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { auth } from "../firebase/firebase";
import { signOut } from "firebase/auth";
import { authenticatedFetch } from "@/utils/authenticatedFetch";
import { clearLoginSecurityStorage } from "@/utils/loginSession";
import { useSelector } from "react-redux";
import { selectuser } from "@/feature/userSlice";
import { useTranslation } from "react-i18next";

type SearchFormProps = {
  search: string;
  onSearchChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  mobile?: boolean;
};

function SearchForm({
  search,
  onSearchChange,
  onSubmit,
  placeholder,
  mobile = false,
}: SearchFormProps) {
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className={`flex min-w-0 items-center rounded-full bg-gray-100 px-4 py-2 ${
        mobile ? "w-full" : ""
      }`}
    >
      <button
        type="submit"
        disabled={!search.trim()}
        aria-label={placeholder}
        className="shrink-0 text-gray-500 transition-colors hover:text-blue-600 disabled:opacity-50"
      >
        <Search size={18} />
      </button>

      <input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`ml-2 min-w-0 bg-transparent text-sm text-gray-900 outline-none ${
          mobile ? "w-full" : "w-36 2xl:w-48"
        }`}
      />
    </form>
  );
}

export const Navbar = () => {
  const user = useSelector(selectuser);
  const { t } = useTranslation();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [router.asPath]);

  useEffect(() => {
    if (!router.isReady) return;

    if (router.pathname === "/search") {
      setSearch(typeof router.query.q === "string" ? router.query.q : "");
    }
  }, [router.isReady, router.pathname, router.query.q]);

  const handleSearch = () => {
    const query = search.trim();
    if (!query) return;

    setIsMenuOpen(false);

    void router.push({
      pathname: "/search",
      query: { q: query },
    });
  };

  const handleLogout = async () => {
    setIsMenuOpen(false);

    try {
      const response = await authenticatedFetch(
        "https://internshala-78tb.onrender.com/api/login-security/logout",
        { method: "POST" },
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

  const searchProps = {
    search,
    onSearchChange: setSearch,
    onSubmit: handleSearch,
    placeholder: t("navbar.searchPlaceholder"),
  };

  return (
    <header className="relative z-40 bg-white shadow-md">
      <nav className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-2">
         
          <Link href="/" aria-label={t("navbar.home")} className="shrink-0">
            <img
              src="/logo.png"
              alt="Internshala"
              className="h-10 w-auto max-w-[110px] object-contain sm:h-12 sm:max-w-[140px] xl:h-14 xl:max-w-[160px]"
            />
          </Link>

         
          <div className="hidden min-w-0 items-center gap-3 xl:flex">
            <Link
              href="/internship"
              className="text-sm text-gray-700 transition-colors hover:text-blue-600"
            >
              {t("navbar.internships")}
            </Link>

            <Link
              href="/job"
              className="text-sm text-gray-700 transition-colors hover:text-blue-600"
            >
              {t("navbar.jobs")}
            </Link>

            <SearchForm {...searchProps} />

            {user && (
              <Link
                href="/social"
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
              >
                <UsersRound size={17} />
                <span>{t("navbar.social")}</span>
              </Link>
            )}
          </div>

         
          <div className="flex min-w-0 items-center gap-2">
            <LanguageSelector />

            
            <div className="hidden items-center gap-2 xl:flex">
              {user ? (
                <>
                  <Link
                    href="/profile"
                    aria-label={t("navbar.profile")}
                    className="flex shrink-0 items-center justify-center"
                  >
                    {user.photo ? (
                      <img
                        src={user.photo}
                        alt={user.name || t("navbar.userPhoto")}
                        referrerPolicy="no-referrer"
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
                        <User className="h-4 w-4 text-gray-500" />
                      </div>
                    )}
                  </Link>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    {t("navbar.logout")}
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/auth"
                    className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    {t("navbar.login")}
                  </Link>

                  <Link
                    href="/adminlogin"
                    className="text-sm text-gray-600 transition-colors hover:text-gray-800"
                  >
                    {t("navbar.admin")}
                  </Link>
                </>
              )}
            </div>

           
            <button
              type="button"
              aria-label={isMenuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={isMenuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-700 transition-colors hover:bg-gray-100 xl:hidden"
            >
              {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

       
        {isMenuOpen && (
          <div
            id="mobile-navigation"
            className="max-h-[calc(100dvh-4rem)] space-y-3 overflow-y-auto border-t border-gray-100 py-4 xl:hidden"
          >
            <SearchForm {...searchProps} mobile />

            <div className="flex flex-col gap-1">
              <Link
                href="/"
                onClick={() => setIsMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-100"
              >
                {t("navbar.home")}
              </Link>

              <Link
                href="/internship"
                onClick={() => setIsMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-100"
              >
                {t("navbar.internships")}
              </Link>

              <Link
                href="/job"
                onClick={() => setIsMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-100"
              >
                {t("navbar.jobs")}
              </Link>

              {user ? (
                <>
                  <Link
                    href="/social"
                    onClick={() => setIsMenuOpen(false)}
                    className="rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-100"
                  >
                    <span className="flex items-center gap-2">
                      <UsersRound size={17} />
                      {t("navbar.social")}
                    </span>
                  </Link>

                  <Link
                    href="/profile"
                    onClick={() => setIsMenuOpen(false)}
                    className="rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-100"
                  >
                    <span className="flex items-center gap-2">
                      <User size={17} />
                      {t("navbar.profile")}
                    </span>
                  </Link>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-lg px-3 py-2 text-left text-gray-700 hover:bg-gray-100"
                  >
                    {t("navbar.logout")}
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/auth"
                    onClick={() => setIsMenuOpen(false)}
                    className="rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-100"
                  >
                    {t("navbar.login")}
                  </Link>

                  <Link
                    href="/adminlogin"
                    onClick={() => setIsMenuOpen(false)}
                    className="rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-100"
                  >
                    {t("navbar.admin")}
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
};
