import { useEffect, useState } from "react";
import { Search, UserRound, UserRoundCheck, UsersRound } from "lucide-react";
import { auth } from "@/firebase/firebase";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";

const API_URL = "https://internshala-78tb.onrender.com";

type SocialUser = {
  id: string;
  username: string;
  name: string;
  photo: string;
  friendCount: number;
  followerCount: number;
  followingCount: number;
  friendshipStatus?: "friends" | "request_sent" | "request_received" | null;
  following?: boolean;
  followedBy?: boolean;
  followedAt?: string;
};

type Tab = "discover" | "following";

export default function SocialFollowing() {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<Tab>("discover");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<SocialUser[]>([]);
  const [followingUsers, setFollowingUsers] = useState<SocialUser[]>([]);
  const [currentUsername, setCurrentUsername] = useState("");
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState("");
  const [error, setError] = useState("");

  const getToken = async () => {
    await auth.authStateReady();

    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      throw new Error("LOGIN_REQUIRED");
    }

    return firebaseUser.getIdToken();
  };

  const loadProfile = async () => {
    const idToken = await getToken();

    const response = await fetch(`${API_URL}/api/social/me`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "SOCIAL_PROFILE_FETCH_FAILED");
    }

    setCurrentUsername(data.user.username);
    setFollowingCount(data.user.followingCount || 0);

    return data.user.username as string;
  };

  const loadUsers = async (query = "") => {
    try {
      setLoading(true);
      setError("");

      const idToken = await getToken();

      const searchParam = query.trim()
        ? `?search=${encodeURIComponent(query.trim())}`
        : "";

      const response = await fetch(
        `${API_URL}/api/social/users${searchParam}`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "SOCIAL_USER_SEARCH_FAILED");
      }

      setUsers(data.users || []);
    } catch (error) {
      console.error("Following user discovery failed:", error);
      setError(t("social.followSearchFailed"));
    } finally {
      setLoading(false);
    }
  };

  const loadFollowing = async (username?: string) => {
    try {
      setLoading(true);
      setError("");

      const resolvedUsername =
        username || currentUsername || (await loadProfile());

      const idToken = await getToken();

      const response = await fetch(
        `${API_URL}/api/social/users/${encodeURIComponent(
          resolvedUsername,
        )}/following`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "FOLLOWING_FETCH_FAILED");
      }

      setFollowingUsers(data.following || []);
    } catch (error) {
      console.error("Following list fetch failed:", error);
      setError(t("social.followingLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        const username = await loadProfile();
        await loadUsers();

        if (!username) {
          throw new Error("USERNAME_NOT_FOUND");
        }
      } catch (error) {
        console.error("Following initialization failed:", error);
        setError(t("social.followingLoadFailed"));
        setLoading(false);
      }
    };

    initialize();
  }, []);

  const changeTab = (tab: Tab) => {
    setActiveTab(tab);
    setError("");

    if (tab === "discover") {
      loadUsers(search);
    } else {
      loadFollowing();
    }
  };

  const handleFollow = async (user: SocialUser) => {
    if (busyUserId) return;

    try {
      setBusyUserId(user.id);

      const idToken = await getToken();

      const response = await fetch(`${API_URL}/api/social/follows/${user.id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "ALREADY_FOLLOWING") {
          setUsers((current) =>
            current.map((currentUser) =>
              currentUser.id === user.id
                ? { ...currentUser, following: true }
                : currentUser,
            ),
          );

          return;
        }

        throw new Error(data.error || "FOLLOW_USER_FAILED");
      }

      setUsers((current) =>
        current.map((currentUser) =>
          currentUser.id === user.id
            ? {
                ...currentUser,
                following: true,
                followerCount: data.targetFollowerCount,
              }
            : currentUser,
        ),
      );

      setFollowingCount(data.followingCount);

      toast.success(
        user.followedBy ? t("social.followedBack") : t("social.userFollowed"),
      );
    } catch (error) {
      console.error("Follow failed:", error);
      toast.error(t("social.followFailed"));
    } finally {
      setBusyUserId("");
    }
  };

  const handleUnfollow = async (user: SocialUser) => {
    if (busyUserId) return;

    try {
      setBusyUserId(user.id);

      const idToken = await getToken();

      const response = await fetch(`${API_URL}/api/social/follows/${user.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "UNFOLLOW_USER_FAILED");
      }

      setUsers((current) =>
        current.map((currentUser) =>
          currentUser.id === user.id
            ? {
                ...currentUser,
                following: false,
                followerCount: data.targetFollowerCount,
              }
            : currentUser,
        ),
      );

      setFollowingUsers((current) =>
        current.filter((currentUser) => currentUser.id !== user.id),
      );

      setFollowingCount(data.followingCount);

      toast.success(t("social.userUnfollowed"));
    } catch (error) {
      console.error("Unfollow failed:", error);
      toast.error(t("social.unfollowFailed"));
    } finally {
      setBusyUserId("");
    }
  };

  const renderUser = (user: SocialUser, followingList = false) => {
    const isFollowing = followingList || Boolean(user.following);
    const busy = busyUserId === user.id;

    return (
      <div
        key={user.id}
        className="flex items-center gap-3 border-b border-gray-100 py-4 last:border-b-0"
      >
        {user.photo ? (
          <img
            src={user.photo}
            alt={user.name || user.username}
            referrerPolicy="no-referrer"
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100">
            <UserRound size={19} className="text-gray-500" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">
            {user.name || user.username}
          </p>

          <p className="truncate text-xs text-gray-500">@{user.username}</p>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
            <span>
              {user.followerCount} {t("social.followersLabel")}
            </span>

            <span>
              {user.followingCount} {t("social.followingLabel")}
            </span>

            {user.followedBy && !isFollowing && (
              <span className="font-medium text-blue-600">
                {t("social.followsYou")}
              </span>
            )}
          </div>
        </div>

        {isFollowing ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => handleUnfollow(user)}
            className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t("social.updatingFollow") : t("social.unfollow")}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => handleFollow(user)}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {busy
              ? t("social.updatingFollow")
              : user.followedBy
                ? t("social.followBack")
                : t("social.follow")}
          </button>
        )}
      </div>
    );
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-5">
        <div className="flex items-center gap-2">
          <UserRoundCheck size={20} className="text-blue-600" />

          <div>
            <h2 className="font-semibold text-gray-900">
              {t("social.following")}
            </h2>

            <p className="text-xs text-gray-500">
              {followingCount} {t("social.peopleFollowing")}
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => changeTab("discover")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeTab === "discover"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t("social.discoverToFollow")}
          </button>

          <button
            type="button"
            onClick={() => changeTab("following")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeTab === "following"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t("social.following")}
          </button>
        </div>
      </div>

      {activeTab === "discover" && (
        <div className="border-b border-gray-100 p-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              loadUsers(search);
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("social.searchToFollow")}
                className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
              />
            </div>

            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t("social.search")}
            </button>
          </form>
        </div>
      )}

      <div className="px-5">
        {loading && (
          <p className="py-8 text-center text-sm text-gray-500">
            {t("common.loading")}
          </p>
        )}

        {!loading && error && (
          <div className="py-8 text-center">
            <p className="text-sm text-red-500">{error}</p>

            <button
              type="button"
              onClick={() =>
                activeTab === "discover" ? loadUsers(search) : loadFollowing()
              }
              className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {t("social.retry")}
            </button>
          </div>
        )}

        {!loading && !error && activeTab === "discover" && !users.length && (
          <div className="py-10 text-center">
            <UsersRound size={30} className="mx-auto text-gray-300" />

            <p className="mt-2 text-sm text-gray-500">
              {t("social.noPeopleToFollow")}
            </p>
          </div>
        )}

        {!loading &&
          !error &&
          activeTab === "discover" &&
          users.map((user) => renderUser(user))}

        {!loading &&
          !error &&
          activeTab === "following" &&
          !followingUsers.length && (
            <div className="py-10 text-center">
              <UserRoundCheck size={30} className="mx-auto text-gray-300" />

              <p className="mt-2 text-sm text-gray-500">
                {t("social.notFollowingAnyone")}
              </p>
            </div>
          )}

        {!loading &&
          !error &&
          activeTab === "following" &&
          followingUsers.map((user) => renderUser(user, true))}
      </div>
    </section>
  );
}
