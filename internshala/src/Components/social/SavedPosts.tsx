import { useEffect, useState } from "react";
import {
  Bookmark,
  Eye,
  Heart,
  MessageCircle,
  Repeat2,
  UserRound,
} from "lucide-react";
import { auth } from "@/firebase/firebase";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";

const API_URL = "https://internshala-78tb.onrender.com";

type Privacy = "public" | "friends" | "followers" | "private";

type SavedAuthor = {
  id: string;
  username: string;
  name: string;
  photo: string;
};

type SavedMedia = {
  id: string;
  resourceType: "image" | "video";
  mimeType: string;
  url: string;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
};

type SavedPost = {
  id: string;
  author: SavedAuthor;
  text: string;
  privacy: Privacy;
  media: SavedMedia | null;
  friendCountAtPosting: number;
  editedAt: string | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  savedAt: string;
};

export default function SavedPosts() {
  const { t } = useTranslation();

  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPostId, setBusyPostId] = useState("");
  const [error, setError] = useState("");

  const getToken = async () => {
    await auth.authStateReady();

    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      throw new Error("LOGIN_REQUIRED");
    }

    return firebaseUser.getIdToken();
  };

  const loadSavedPosts = async () => {
    try {
      setLoading(true);
      setError("");

      const idToken = await getToken();

      const response = await fetch(`${API_URL}/api/posts/saved/me`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "SAVED_POSTS_FETCH_FAILED");
      }

      setPosts(data.posts || []);
    } catch (error) {
      console.error("Saved posts fetch failed:", error);
      setError(t("social.savedPostsLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSavedPosts();
  }, []);

  const handleUnsave = async (postId: string) => {
    if (busyPostId) return;

    try {
      setBusyPostId(postId);

      const idToken = await getToken();

      const response = await fetch(`${API_URL}/api/posts/${postId}/saves`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "POST_UNSAVE_FAILED");
      }

      setPosts((current) => current.filter((post) => post.id !== postId));

      toast.success(t("social.postRemovedFromSaved"));
    } catch (error) {
      console.error("Saved post removal failed:", error);
      toast.error(t("social.savedPostRemoveFailed"));
    } finally {
      setBusyPostId("");
    }
  };

  const formatDate = (value: string) => {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  };

  const getPrivacyLabel = (privacy: Privacy) => {
    if (privacy === "friends") {
      return t("social.privacyFriends");
    }

    if (privacy === "followers") {
      return t("social.privacyFollowers");
    }

    if (privacy === "private") {
      return t("social.privacyPrivate");
    }

    return t("social.privacyPublic");
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-red-500">{error}</p>

        <button
          type="button"
          onClick={loadSavedPosts}
          className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          {t("social.retry")}
        </button>
      </div>
    );
  }

  return (
    <section>
      <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <Bookmark size={20} className="fill-blue-600 text-blue-600" />
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">
              {t("social.savedPosts")}
            </h2>

            <p className="text-sm text-gray-500">
              {t("social.savedPostsDescription")}
            </p>
          </div>
        </div>
      </div>

      {!posts.length ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <Bookmark size={34} className="mx-auto text-gray-300" />

          <h3 className="mt-3 font-semibold text-gray-800">
            {t("social.noSavedPosts")}
          </h3>

          <p className="mt-1 text-sm text-gray-500">
            {t("social.noSavedPostsDescription")}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {posts.map((post) => (
            <article
              key={post.id}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
            >
              <div className="p-5">
                <div className="flex items-start gap-3">
                  {post.author?.photo ? (
                    <img
                      src={post.author.photo}
                      alt={post.author.name || post.author.username}
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
                      {post.author?.name || post.author?.username}
                    </p>

                    <p className="truncate text-xs text-gray-500">
                      @{post.author?.username}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
                      <span>{formatDate(post.createdAt)}</span>

                      <span>•</span>

                      <span>{getPrivacyLabel(post.privacy)}</span>

                      {post.editedAt && (
                        <>
                          <span>•</span>
                          <span>{t("social.edited")}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={busyPostId === post.id}
                    onClick={() => handleUnsave(post.id)}
                    aria-label={t("social.removeSavedPost")}
                    title={t("social.removeSavedPost")}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Bookmark size={16} className="fill-current" />

                    {busyPostId === post.id
                      ? t("social.removingSavedPost")
                      : t("social.removeSavedPost")}
                  </button>
                </div>

                <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">
                  {post.text}
                </p>
              </div>

              {post.media && (
                <div className="border-y border-gray-100 bg-gray-50">
                  {post.media.resourceType === "image" ? (
                    <img
                      src={post.media.url}
                      alt={t("social.postMedia")}
                      className="max-h-[600px] w-full object-contain"
                    />
                  ) : (
                    <video
                      src={post.media.url}
                      controls
                      preload="metadata"
                      className="max-h-[600px] w-full bg-black"
                    />
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs text-gray-500">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <Heart size={17} />
                    {post.likeCount}
                  </span>

                  <span className="flex items-center gap-1.5">
                    <MessageCircle size={17} />
                    {post.commentCount}
                  </span>

                  <span className="flex items-center gap-1.5">
                    <Repeat2 size={17} />
                    {post.shareCount}
                  </span>

                  <span className="flex items-center gap-1.5">
                    <Bookmark
                      size={17}
                      className="fill-current text-blue-600"
                    />
                    {post.saveCount}
                  </span>
                </div>

                <span className="flex items-center gap-1.5">
                  <Eye size={17} />
                  {post.viewCount}
                </span>
              </div>

              <div className="border-t border-gray-100 px-5 py-2 text-xs text-gray-400">
                {t("social.savedAt", {
                  date: formatDate(post.savedAt),
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
