import { useEffect, useState } from "react";
import {
  AtSign,
  Bell,
  Check,
  CheckCheck,
  Heart,
  MessageCircle,
  Repeat2,
  UserPlus,
  UserRound,
  UserRoundCheck,
} from "lucide-react";
import { auth } from "@/firebase/firebase";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";

const API_URL = "https://internshala-78tb.onrender.com";

type NotificationType =
  | "mention"
  | "like"
  | "comment"
  | "share"
  | "follow"
  | "friend_request"
  | "friend_accept";

type NotificationActor = {
  id: string;
  username: string;
  name: string;
  photo: string;
};

type SocialNotification = {
  id: string;
  type: NotificationType;
  actor: NotificationActor | null;
  postId: string | null;
  commentId: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function SocialNotifications() {
  const { t } = useTranslation();

  const [notifications, setNotifications] = useState<SocialNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [busyNotificationId, setBusyNotificationId] = useState("");
  const [error, setError] = useState("");

  const getToken = async () => {
    await auth.authStateReady();

    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      throw new Error("LOGIN_REQUIRED");
    }

    return firebaseUser.getIdToken();
  };

  const loadNotifications = async () => {
    try {
      setLoading(true);
      setError("");

      const idToken = await getToken();

      const [notificationsResponse, countResponse] = await Promise.all([
        fetch(`${API_URL}/api/notifications?limit=50`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }),

        fetch(`${API_URL}/api/notifications/unread-count`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }),
      ]);

      const notificationsData = await notificationsResponse.json();
      const countData = await countResponse.json();

      if (!notificationsResponse.ok) {
        throw new Error(
          notificationsData.error || "NOTIFICATION_LIST_FETCH_FAILED",
        );
      }

      if (!countResponse.ok) {
        throw new Error(
          countData.error || "NOTIFICATION_UNREAD_COUNT_FETCH_FAILED",
        );
      }

      setNotifications(notificationsData.notifications || []);
      setUnreadCount(countData.unreadCount || 0);
    } catch (error) {
      console.error("Notifications fetch failed:", error);
      setError(t("social.notificationsLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const markAsRead = async (notification: SocialNotification) => {
    if (notification.read || busyNotificationId) return;

    try {
      setBusyNotificationId(notification.id);

      const idToken = await getToken();

      const response = await fetch(
        `${API_URL}/api/notifications/${notification.id}/read`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "NOTIFICATION_MARK_READ_FAILED");
      }

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? data.notification : item,
        ),
      );

      setUnreadCount((current) => Math.max(current - 1, 0));
    } catch (error) {
      console.error("Notification mark read failed:", error);
      toast.error(t("social.notificationReadFailed"));
    } finally {
      setBusyNotificationId("");
    }
  };

  const markAllAsRead = async () => {
    if (!unreadCount || markingAll) return;

    try {
      setMarkingAll(true);

      const idToken = await getToken();

      const response = await fetch(`${API_URL}/api/notifications/read-all`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "NOTIFICATION_MARK_ALL_READ_FAILED");
      }

      const now = new Date().toISOString();

      setNotifications((current) =>
        current.map((notification) =>
          notification.read
            ? notification
            : {
                ...notification,
                read: true,
                readAt: now,
              },
        ),
      );

      setUnreadCount(0);

      toast.success(t("social.notificationsMarkedRead"));
    } catch (error) {
      console.error("Mark all notifications read failed:", error);
      toast.error(t("social.notificationsMarkAllFailed"));
    } finally {
      setMarkingAll(false);
    }
  };

  const getNotificationDetails = (notification: SocialNotification) => {
    const actorName =
      notification.actor?.name ||
      notification.actor?.username ||
      t("social.someone");

    switch (notification.type) {
      case "mention":
        return {
          Icon: AtSign,
          message: t("social.notificationMention", {
            name: actorName,
          }),
        };

      case "like":
        return {
          Icon: Heart,
          message: t("social.notificationLike", {
            name: actorName,
          }),
        };

      case "comment":
        return {
          Icon: MessageCircle,
          message: t("social.notificationComment", {
            name: actorName,
          }),
        };

      case "share":
        return {
          Icon: Repeat2,
          message: t("social.notificationShare", {
            name: actorName,
          }),
        };

      case "follow":
        return {
          Icon: UserPlus,
          message: t("social.notificationFollow", {
            name: actorName,
          }),
        };

      case "friend_request":
        return {
          Icon: UserRound,
          message: t("social.notificationFriendRequest", {
            name: actorName,
          }),
        };

      case "friend_accept":
        return {
          Icon: UserRoundCheck,
          message: t("social.notificationFriendAccept", {
            name: actorName,
          }),
        };

      default:
        return {
          Icon: Bell,
          message: t("social.notificationDefault"),
        };
    }
  };

  const formatDate = (value: string) => {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-gray-100 p-5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell size={21} className="text-blue-600" />

            {unreadCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">
              {t("social.notifications")}
            </h2>

            <p className="text-xs text-gray-500">
              {unreadCount === 1
                ? t("social.oneUnreadNotification")
                : t("social.unreadNotifications", {
                    count: unreadCount,
                  })}
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            disabled={markingAll}
            onClick={markAllAsRead}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCheck size={16} />

            {markingAll ? t("social.markingRead") : t("social.markAllRead")}
          </button>
        )}
      </div>

      {loading && (
        <p className="p-8 text-center text-sm text-gray-500">
          {t("common.loading")}
        </p>
      )}

      {!loading && error && (
        <div className="p-8 text-center">
          <p className="text-sm text-red-500">{error}</p>

          <button
            type="button"
            onClick={loadNotifications}
            className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            {t("social.retry")}
          </button>
        </div>
      )}

      {!loading && !error && !notifications.length && (
        <div className="p-10 text-center">
          <Bell size={32} className="mx-auto text-gray-300" />

          <p className="mt-3 text-sm font-medium text-gray-700">
            {t("social.noNotifications")}
          </p>

          <p className="mt-1 text-xs text-gray-500">
            {t("social.noNotificationsDescription")}
          </p>
        </div>
      )}

      {!loading && !error && notifications.length > 0 && (
        <div>
          {notifications.map((notification) => {
            const details = getNotificationDetails(notification);
            const NotificationIcon = details.Icon;
            const busy = busyNotificationId === notification.id;

            return (
              <div
                key={notification.id}
                className={`flex gap-3 border-b border-gray-100 p-4 last:border-b-0 ${
                  notification.read ? "bg-white" : "bg-blue-50/50"
                }`}
              >
                {notification.actor?.photo ? (
                  <img
                    src={notification.actor.photo}
                    alt={notification.actor.name || notification.actor.username}
                    referrerPolicy="no-referrer"
                    className="h-11 w-11 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100">
                    <UserRound size={18} className="text-gray-500" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <NotificationIcon
                      size={16}
                      className="mt-0.5 shrink-0 text-blue-600"
                    />

                    <p
                      className={`text-sm leading-5 ${
                        notification.read
                          ? "text-gray-700"
                          : "font-medium text-gray-900"
                      }`}
                    >
                      {details.message}
                    </p>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <span>{formatDate(notification.createdAt)}</span>

                    {!notification.read && (
                      <>
                        <span>•</span>

                        <span className="font-medium text-blue-600">
                          {t("social.unread")}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {!notification.read && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => markAsRead(notification)}
                    aria-label={t("social.markAsRead")}
                    title={t("social.markAsRead")}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-blue-100 hover:text-blue-600 disabled:opacity-50"
                  >
                    <Check size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
