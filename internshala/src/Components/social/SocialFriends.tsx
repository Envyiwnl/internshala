import { SubmitEvent, useEffect, useState } from "react";
import { Search, UserRound, UserRoundPlus } from "lucide-react";
import { auth } from "@/firebase/firebase";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";

const API_URL = "https://internshala-78tb.onrender.com";

type FriendshipStatus = "friends" | "request_sent" | "request_received" | null;

type SocialUser = {
  id: string;
  username: string;
  name: string;
  photo: string;
  friendCount: number;
  followerCount: number;
  followingCount: number;
  friendshipStatus?: FriendshipStatus;
};

type FriendRequest = {
  id: string;
  requester: SocialUser;
  recipient: SocialUser;
};

type Friend = SocialUser & {
  friendsSince?: string;
};

type Tab = "discover" | "requests" | "friends";

export default function SocialFriends() {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<Tab>("discover");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<SocialUser[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);

  const getToken = async () => {
    await auth.authStateReady();

    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      throw new Error("LOGIN_REQUIRED");
    }

    return firebaseUser.getIdToken();
  };

  const loadUsers = async (searchValue = "") => {
    try {
      setLoading(true);

      const idToken = await getToken();

      const query = searchValue.trim()
        ? `?search=${encodeURIComponent(searchValue.trim())}`
        : "";

      const response = await fetch(`${API_URL}/api/social/users${query}`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "SOCIAL_USER_SEARCH_FAILED");
      }

      setUsers(data.users || []);
    } catch (error) {
      console.error("Social user search failed:", error);
      toast.error(t("social.friendSearchFailed"));
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    try {
      setLoading(true);

      const idToken = await getToken();

      const response = await fetch(
        `${API_URL}/api/social/friend-requests?direction=incoming`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "FRIEND_REQUEST_LIST_FAILED");
      }

      setRequests(data.requests || []);
    } catch (error) {
      console.error("Friend requests fetch failed:", error);
      toast.error(t("social.friendRequestsFailed"));
    } finally {
      setLoading(false);
    }
  };

  const loadFriends = async () => {
    try {
      setLoading(true);

      const idToken = await getToken();

      const response = await fetch(`${API_URL}/api/social/friends`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "FRIEND_LIST_FETCH_FAILED");
      }

      setFriends(data.friends || []);
    } catch (error) {
      console.error("Friends fetch failed:", error);
      toast.error(t("social.friendListFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);

    if (tab === "discover") {
      loadUsers(search);
    }

    if (tab === "requests") {
      loadRequests();
    }

    if (tab === "friends") {
      loadFriends();
    }
  };

  const handleSearch = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    loadUsers(search);
  };

  const sendFriendRequest = async (userId: string) => {
    try {
      const idToken = await getToken();

      const response = await fetch(
        `${API_URL}/api/social/friend-requests/${userId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "SOCIAL_RATE_LIMITED") {
          toast.error(t("social.rateLimited"));
          return;
        }

        throw new Error(data.error || "FRIEND_REQUEST_FAILED");
      }

      setUsers((current) =>
        current.map((user) =>
          user.id === userId
            ? { ...user, friendshipStatus: "request_sent" }
            : user,
        ),
      );

      toast.success(t("social.friendRequestSent"));
    } catch (error) {
      const errorCode =
        error instanceof Error ? error.message : "FRIEND_REQUEST_FAILED";

      const messages: Record<string, string> = {
        ALREADY_FRIENDS: t("social.alreadyFriends"),
        FRIEND_REQUEST_ALREADY_SENT: t("social.friendRequestAlreadySent"),
        FRIEND_REQUEST_ALREADY_RECEIVED: t(
          "social.friendRequestAlreadyReceived",
        ),
      };

      toast.error(messages[errorCode] || t("social.friendRequestFailed"));
    }
  };

  const acceptFriendRequest = async (requestId: string) => {
    try {
      const idToken = await getToken();

      const response = await fetch(
        `${API_URL}/api/social/friend-requests/${requestId}/accept`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "FRIEND_REQUEST_ACCEPT_FAILED");
      }

      setRequests((current) =>
        current.filter((request) => request.id !== requestId),
      );

      toast.success(t("social.friendRequestAccepted"));
    } catch (error) {
      console.error("Friend request acceptance failed:", error);
      toast.error(t("social.friendRequestAcceptFailed"));
    }
  };

  const rejectFriendRequest = async (requestId: string) => {
    try {
      const idToken = await getToken();

      const response = await fetch(
        `${API_URL}/api/social/friend-requests/${requestId}/reject`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "FRIEND_REQUEST_REJECT_FAILED");
      }

      setRequests((current) =>
        current.filter((request) => request.id !== requestId),
      );

      toast.success(t("social.friendRequestRejected"));
    } catch (error) {
      console.error("Friend request rejection failed:", error);
      toast.error(t("social.friendRequestRejectFailed"));
    }
  };

  const renderAvatar = (user: SocialUser) =>
    user.photo ? (
      <img
        src={user.photo}
        alt={user.name || user.username}
        referrerPolicy="no-referrer"
        className="h-11 w-11 rounded-full object-cover"
      />
    ) : (
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100">
        <UserRound className="h-5 w-5 text-gray-500" />
      </div>
    );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-5">
        <h2 className="text-lg font-semibold text-gray-900">
          {t("social.friends")}
        </h2>

        <div className="mt-4 flex gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => handleTabChange("discover")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === "discover"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t("social.discoverPeople")}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("requests")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === "requests"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t("social.friendRequests")}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("friends")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === "friends"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t("social.myFriends")}
          </button>
        </div>
      </div>

      <div className="p-5">
        {activeTab === "discover" && (
          <>
            <form onSubmit={handleSearch} className="mb-5 flex gap-2">
              <div className="flex flex-1 items-center rounded-xl border border-gray-200 px-3">
                <Search size={18} className="text-gray-400" />

                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("social.searchPeople")}
                  className="w-full bg-transparent px-3 py-2.5 text-sm outline-none"
                />
              </div>

              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                {t("common.search")}
              </button>
            </form>

            {!loading && !users.length && (
              <p className="py-8 text-center text-sm text-gray-500">
                {t("social.noUsersFound")}
              </p>
            )}

            <div className="space-y-3">
              {users.map((socialUser) => (
                <div
                  key={socialUser.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {renderAvatar(socialUser)}

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {socialUser.name || socialUser.username}
                      </p>

                      <p className="truncate text-xs text-gray-500">
                        @{socialUser.username}
                      </p>
                    </div>
                  </div>

                  {socialUser.friendshipStatus === "friends" ? (
                    <span className="text-sm font-medium text-green-600">
                      {t("social.alreadyFriends")}
                    </span>
                  ) : socialUser.friendshipStatus === "request_sent" ? (
                    <span className="text-sm text-gray-500">
                      {t("social.requestSent")}
                    </span>
                  ) : socialUser.friendshipStatus === "request_received" ? (
                    <span className="text-sm text-orange-500">
                      {t("social.requestReceived")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => sendFriendRequest(socialUser.id)}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100"
                    >
                      <UserRoundPlus size={16} />
                      {t("social.addFriend")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === "requests" && (
          <>
            {!loading && !requests.length && (
              <p className="py-8 text-center text-sm text-gray-500">
                {t("social.noFriendRequests")}
              </p>
            )}

            <div className="space-y-3">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-col gap-3 rounded-xl border border-gray-100 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {renderAvatar(request.requester)}

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {request.requester.name || request.requester.username}
                      </p>

                      <p className="truncate text-xs text-gray-500">
                        @{request.requester.username}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => rejectFriendRequest(request.id)}
                      className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                      {t("social.reject")}
                    </button>

                    <button
                      type="button"
                      onClick={() => acceptFriendRequest(request.id)}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      {t("social.accept")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === "friends" && (
          <>
            {!loading && !friends.length && (
              <p className="py-8 text-center text-sm text-gray-500">
                {t("social.noFriends")}
              </p>
            )}

            <div className="space-y-3">
              {friends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-100 p-3"
                >
                  {renderAvatar(friend)}

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {friend.name || friend.username}
                    </p>

                    <p className="truncate text-xs text-gray-500">
                      @{friend.username}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {loading && (
          <div className="py-8 text-center text-sm text-gray-500">
            {t("common.loading")}
          </div>
        )}
      </div>
    </div>
  );
}
