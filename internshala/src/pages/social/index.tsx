import { Bell, UserRoundPlus, UsersRound, Bookmark } from "lucide-react";
import { useTranslation } from "react-i18next";
import CreatePostComposer from "@/Components/social/CreatePostComposer";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { auth } from "@/firebase/firebase";

import SocialFriends from "@/Components/social/SocialFriends";
import SocialFeed from "@/Components/social/SocialFeed";
import SocialFollowing from "@/Components/social/SocialFollowing";
import SocialNotifications from "@/Components/social/SocialNotifications";
import SavedPosts from "@/Components/social/SavedPosts";

export default function SocialPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeSection, setActiveSection] = useState<
    "feed" | "friends" | "following" | "notifications" | "saved"
  >("feed");
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const checkAuth = async () => {
      await auth.authStateReady();

      if (!active) return;

      if (!auth.currentUser) {
        setAuthChecked(true);
        router.replace("/auth");
        return;
      }

      setIsAuthenticated(true);
      setAuthChecked(true);
    };

    checkAuth();

    return () => {
      active = false;
    };
  }, [router]);

  if (!authChecked || !isAuthenticated) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4">
          <p className="text-sm text-gray-500">{t("common.loading")}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">
            {t("social.title")}
          </h1>

          <p className="mt-1 text-sm text-gray-500">{t("social.subtitle")}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0 space-y-6">
            {activeSection === "feed" && (
              <>
                <CreatePostComposer
                  onPostCreated={() =>
                    setFeedRefreshKey((current) => current + 1)
                  }
                />

                <SocialFeed refreshKey={feedRefreshKey} />
              </>
            )}

            {activeSection === "saved" && <SavedPosts />}

            {activeSection === "friends" && <SocialFriends />}

            {activeSection === "following" && <SocialFollowing />}

            {activeSection === "notifications" && <SocialNotifications />}
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900">
                {t("social.socialNetwork")}
              </h2>

              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setActiveSection("feed")}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    activeSection === "feed"
                      ? "bg-blue-50 font-medium text-blue-600"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <UsersRound size={18} className="text-blue-600" />
                  {t("social.feedTitle")}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection("saved")}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    activeSection === "saved"
                      ? "bg-blue-50 text-blue-600"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Bookmark size={18} />
                  {t("social.savedPosts")}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection("friends")}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    activeSection === "friends"
                      ? "bg-blue-50 font-medium text-blue-600"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <UsersRound size={18} className="text-blue-600" />
                  {t("social.friends")}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSection("following")}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    activeSection === "following"
                      ? "bg-blue-50 font-medium text-blue-600"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <UserRoundPlus size={18} className="text-blue-600" />
                  {t("social.following")}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSection("notifications")}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    activeSection === "notifications"
                      ? "bg-blue-50 text-blue-600"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Bell size={18} />
                  {t("social.notifications")}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
