import { useEffect, useState, useRef } from "react";
import {
  Bookmark,
  Eye,
  Heart,
  Lock,
  MessageCircle,
  Repeat2,
  UserRound,
  UserRoundCheck,
  UsersRound,
  Globe2,
} from "lucide-react";
import { auth } from "@/firebase/firebase";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import PostComments from "@/Components/social/PostComments";
import PostActionsMenu from "@/Components/social/PostActionsMenu";

const API_URL = "https://internshala-78tb.onrender.com";
const FEED_LIMIT = 10;

type Privacy = "public" | "friends" | "followers" | "private";

type FeedAuthor = {
  id: string;
  username: string;
  name: string;
  photo: string;
};

type FeedMedia = {
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

type FeedPost = {
  id: string;
  author: FeedAuthor;
  text: string;
  privacy: Privacy;
  media: FeedMedia | null;
  hashtags: string[];
  friendCountAtPosting: number;
  editedAt: string | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  liked: boolean;
  saved: boolean;
  shared: boolean;
};

type FeedResponse = {
  posts: FeedPost[];
  count: number;
  pagination: {
    offset: number;
    nextOffset: number | null;
    hasMore: boolean;
  };
};

type SocialFeedProps = {
  refreshKey: number;
};

export default function SocialFeed({ refreshKey }: SocialFeedProps) {
  const { t } = useTranslation();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [busyActions, setBusyActions] = useState<Set<string>>(new Set());
  const viewedPostsRef = useRef<Set<string>>(new Set());
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(
    null,
  );

  const [currentUserId, setCurrentUserId] = useState("");

  const getToken = async () => {
    await auth.authStateReady();

    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      throw new Error("LOGIN_REQUIRED");
    }

    return firebaseUser.getIdToken();
  };

  const setActionBusy = (
    postId: string,
    action: "like" | "save" | "share",
    busy: boolean,
  ) => {
    const key = `${postId}:${action}`;

    setBusyActions((current) => {
      const next = new Set(current);

      if (busy) {
        next.add(key);
      } else {
        next.delete(key);
      }

      return next;
    });
  };

  const isActionBusy = (postId: string, action: "like" | "save" | "share") => {
    return busyActions.has(`${postId}:${action}`);
  };

  const loadFeed = async (offset = 0, append = false) => {
    try {
      append ? setLoadingMore(true) : setLoading(true);
      setError("");

      await auth.authStateReady();

      const firebaseUser = auth.currentUser;

      if (!firebaseUser) {
        throw new Error("LOGIN_REQUIRED");
      }

      const idToken = await firebaseUser.getIdToken();

      const response = await fetch(
        `${API_URL}/api/feed?limit=${FEED_LIMIT}&offset=${offset}`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      );

      const data: FeedResponse = await response.json();

      if (!response.ok) {
        throw new Error("FEED_FETCH_FAILED");
      }

      setPosts((current) =>
        append ? [...current, ...(data.posts || [])] : data.posts || [],
      );

      setNextOffset(data.pagination?.nextOffset ?? null);
    } catch (error) {
      console.error("Feed fetch failed:", error);
      setError(t("social.feedLoadFailed"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLike = async (post: FeedPost) => {
    if (isActionBusy(post.id, "like")) return;

    setActionBusy(post.id, "like", true);

    try {
      const idToken = await getToken();

      const response = await fetch(`${API_URL}/api/posts/${post.id}/likes`, {
        method: post.liked ? "DELETE" : "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "POST_LIKE_FAILED");
      }

      setPosts((current) =>
        current.map((currentPost) =>
          currentPost.id === post.id
            ? {
                ...currentPost,
                liked: data.liked,
                likeCount: data.likeCount,
              }
            : currentPost,
        ),
      );
    } catch (error) {
      console.error("Post like interaction failed:", error);
      toast.error(t("social.likeFailed"));
    } finally {
      setActionBusy(post.id, "like", false);
    }
  };

  const handleSave = async (post: FeedPost) => {
    if (isActionBusy(post.id, "save")) return;

    setActionBusy(post.id, "save", true);

    try {
      const idToken = await getToken();

      const response = await fetch(`${API_URL}/api/posts/${post.id}/saves`, {
        method: post.saved ? "DELETE" : "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "POST_SAVE_FAILED");
      }

      setPosts((current) =>
        current.map((currentPost) =>
          currentPost.id === post.id
            ? {
                ...currentPost,
                saved: data.saved,
                saveCount: data.saveCount,
              }
            : currentPost,
        ),
      );
    } catch (error) {
      console.error("Post save interaction failed:", error);
      toast.error(t("social.saveFailed"));
    } finally {
      setActionBusy(post.id, "save", false);
    }
  };

  const handleShare = async (post: FeedPost) => {
    if (post.shared || isActionBusy(post.id, "share")) return;

    setActionBusy(post.id, "share", true);

    try {
      const idToken = await getToken();

      const response = await fetch(`${API_URL}/api/posts/${post.id}/shares`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "POST_SHARE_FAILED");
      }

      setPosts((current) =>
        current.map((currentPost) =>
          currentPost.id === post.id
            ? {
                ...currentPost,
                shared: data.shared,
                shareCount: data.shareCount,
              }
            : currentPost,
        ),
      );

      toast.success(t("social.postShared"));
    } catch (error) {
      console.error("Post share failed:", error);
      toast.error(t("social.shareFailed"));
    } finally {
      setActionBusy(post.id, "share", false);
    }
  };

  const recordView = async (postId: string) => {
    if (viewedPostsRef.current.has(postId)) return;

    viewedPostsRef.current.add(postId);

    try {
      const idToken = await getToken();

      const response = await fetch(`${API_URL}/api/posts/${postId}/views`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "POST_VIEW_FAILED");
      }

      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                viewCount: data.viewCount,
              }
            : post,
        ),
      );
    } catch (error) {
      console.error("Post view recording failed:", error);
    }
  };

  useEffect(() => {
    loadFeed();
  }, [refreshKey]);

  useEffect(() => {
    posts.forEach((post) => {
      recordView(post.id);
    });
  }, [posts]);

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
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

        setCurrentUserId(data.user.id);
      } catch (error) {
        console.error("Social profile fetch failed:", error);
      }
    };

    loadCurrentUser();
  }, []);

  const getPrivacyDetails = (privacy: Privacy) => {
    if (privacy === "friends") {
      return {
        label: t("social.privacyFriends"),
        Icon: UsersRound,
      };
    }

    if (privacy === "followers") {
      return {
        label: t("social.privacyFollowers"),
        Icon: UserRoundCheck,
      };
    }

    if (privacy === "private") {
      return {
        label: t("social.privacyPrivate"),
        Icon: Lock,
      };
    }

    return {
      label: t("social.privacyPublic"),
      Icon: Globe2,
    };
  };

  const formatDate = (value: string) => {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
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
          onClick={() => loadFeed()}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t("social.retry")}
        </button>
      </div>
    );
  }

  if (!posts.length) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <UsersRound className="mx-auto h-9 w-9 text-gray-300" />

        <h2 className="mt-3 text-base font-semibold text-gray-800">
          {t("social.feedTitle")}
        </h2>

        <p className="mt-1 text-sm text-gray-500">{t("social.noFeedPosts")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {posts.map((post) => {
        const privacyDetails = getPrivacyDetails(post.privacy);
        const PrivacyIcon = privacyDetails.Icon;

        return (
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
                    <UserRound className="h-5 w-5 text-gray-500" />
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

                    <span className="flex items-center gap-1">
                      <PrivacyIcon size={13} />
                      {privacyDetails.label}
                    </span>

                    {post.editedAt && (
                      <>
                        <span>•</span>
                        <span>{t("social.edited")}</span>
                      </>
                    )}
                  </div>
                </div>
                {currentUserId && (
                  <PostActionsMenu
                    postId={post.id}
                    text={post.text}
                    privacy={post.privacy}
                    createdAt={post.createdAt}
                    isOwnPost={post.author.id === currentUserId}
                    onPostUpdated={(updatedPost) =>
                      setPosts((current) =>
                        current.map((currentPost) =>
                          currentPost.id === post.id
                            ? {
                                ...currentPost,
                                text: updatedPost.text,
                                privacy: updatedPost.privacy,
                                editedAt: updatedPost.editedAt,
                              }
                            : currentPost,
                        ),
                      )
                    }
                    onPostDeleted={(postId) => {
                      setPosts((current) =>
                        current.filter(
                          (currentPost) => currentPost.id !== postId,
                        ),
                      );

                      setOpenCommentsPostId((current) =>
                        current === postId ? null : current,
                      );
                    }}
                  />
                )}
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
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  disabled={isActionBusy(post.id, "like")}
                  onClick={() => handleLike(post)}
                  aria-label={
                    post.liked ? t("social.unlikePost") : t("social.likePost")
                  }
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                    post.liked ? "text-red-500" : "text-gray-500"
                  }`}
                >
                  <Heart
                    size={17}
                    className={post.liked ? "fill-current" : ""}
                  />
                  {post.likeCount}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setOpenCommentsPostId((current) =>
                      current === post.id ? null : post.id,
                    )
                  }
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition hover:bg-gray-100 ${
                    openCommentsPostId === post.id
                      ? "text-blue-600"
                      : "text-gray-500"
                  }`}
                  aria-label={t("social.comments")}
                >
                  <MessageCircle size={17} />
                  {post.commentCount}
                </button>

                <button
                  type="button"
                  disabled={post.shared || isActionBusy(post.id, "share")}
                  onClick={() => handleShare(post)}
                  aria-label={t("social.sharePost")}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition hover:bg-gray-100 disabled:cursor-default ${
                    post.shared ? "text-blue-600" : "text-gray-500"
                  }`}
                >
                  <Repeat2 size={17} />
                  {post.shareCount}
                </button>

                <button
                  type="button"
                  disabled={isActionBusy(post.id, "save")}
                  onClick={() => handleSave(post)}
                  aria-label={
                    post.saved ? t("social.unsavePost") : t("social.savePost")
                  }
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                    post.saved ? "text-blue-600" : "text-gray-500"
                  }`}
                >
                  <Bookmark
                    size={17}
                    className={post.saved ? "fill-current" : ""}
                  />
                  {post.saveCount}
                </button>
              </div>

              <span className="flex items-center gap-1.5">
                <Eye size={17} />
                {post.viewCount}
              </span>
            </div>
            {openCommentsPostId === post.id && (
              <PostComments
                postId={post.id}
                currentUserId={currentUserId}
                onCommentCountChange={(count) =>
                  setPosts((current) =>
                    current.map((currentPost) =>
                      currentPost.id === post.id
                        ? {
                            ...currentPost,
                            commentCount: count,
                          }
                        : currentPost,
                    ),
                  )
                }
              />
            )}
          </article>
        );
      })}

      {nextOffset !== null && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => loadFeed(nextOffset, true)}
            className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? t("social.loadingMore") : t("social.loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
