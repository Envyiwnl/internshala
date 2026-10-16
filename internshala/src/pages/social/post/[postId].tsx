import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  Eye,
  Globe2,
  Lock,
  UserRound,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { auth } from "@/firebase/firebase";
import { useTranslation } from "react-i18next";

const API_URL = "https://internshala-78tb.onrender.com";

type Privacy = "public" | "friends" | "followers" | "private";

type PostAuthor = {
  id: string;
  username: string;
  name: string;
  photo: string;
};

type PostMedia = {
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

type SocialPost = {
  id: string;
  author: PostAuthor;
  text: string;
  privacy: Privacy;
  media: PostMedia | null;
  friendCountAtPosting: number;
  editedAt: string | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
};

export default function SharedPostPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [post, setPost] = useState<SocialPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady) return;

    const loadPost = async () => {
      try {
        setLoading(true);
        setError("");

        await auth.authStateReady();

        const firebaseUser = auth.currentUser;

        if (!firebaseUser) {
          const redirect = encodeURIComponent(router.asPath);

          router.replace(`/auth?redirect=${redirect}`);
          return;
        }

        const idToken = await firebaseUser.getIdToken();

        const response = await fetch(
          `${API_URL}/api/posts/${router.query.postId}`,
          {
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          },
        );

        const data = await response.json();

        if (!response.ok) {
          if (data.error === "POST_ACCESS_DENIED") {
            setError(t("social.sharedPostAccessDenied"));
            return;
          }

          if (data.error === "POST_NOT_FOUND") {
            setError(t("social.sharedPostNotFound"));
            return;
          }

          throw new Error(data.error || "POST_FETCH_FAILED");
        }

        setPost(data.post);

        try {
          const viewResponse = await fetch(
            `${API_URL}/api/posts/${data.post.id}/views`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${idToken}`,
              },
            },
          );

          const viewData = await viewResponse.json();

          if (viewResponse.ok) {
            setPost((current) =>
              current
                ? {
                    ...current,
                    viewCount: viewData.viewCount,
                  }
                : current,
            );
          }
        } catch (viewError) {
          console.error("Shared post view recording failed:", viewError);
        }
      } catch (error) {
        console.error("Shared post fetch failed:", error);
        setError(t("social.sharedPostLoadFailed"));
      } finally {
        setLoading(false);
      }
    };

    loadPost();
  }, [router.isReady, router.query.postId]);

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
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-4">
          <p className="text-sm text-gray-500">{t("common.loading")}</p>
        </div>
      </main>
    );
  }

  if (error || !post) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <button
            type="button"
            onClick={() => router.push("/social")}
            className="flex items-center gap-2 text-sm font-medium text-blue-600"
          >
            <ArrowLeft size={17} />
            {t("social.backToPublicSpace")}
          </button>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <p className="text-sm text-gray-600">
              {error || t("social.sharedPostNotFound")}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const privacyDetails = getPrivacyDetails(post.privacy);
  const PrivacyIcon = privacyDetails.Icon;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <button
          type="button"
          onClick={() => router.push("/social")}
          className="mb-5 flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          <ArrowLeft size={17} />
          {t("social.backToPublicSpace")}
        </button>

        <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="p-5">
            <div className="flex items-start gap-3">
              {post.author.photo ? (
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
                  {post.author.name || post.author.username}
                </p>

                <p className="truncate text-xs text-gray-500">
                  @{post.author.username}
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
                  className="max-h-[700px] w-full object-contain"
                />
              ) : (
                <video
                  src={post.media.url}
                  controls
                  preload="metadata"
                  className="max-h-[700px] w-full bg-black"
                />
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs text-gray-500">
            <div className="flex items-center gap-4">
              <span>
                {post.likeCount} {t("social.likesLabel")}
              </span>

              <span>
                {post.commentCount} {t("social.commentsLabel")}
              </span>

              <span>
                {post.shareCount} {t("social.sharesLabel")}
              </span>
            </div>

            <span className="flex items-center gap-1.5">
              <Eye size={16} />
              {post.viewCount}
            </span>
          </div>
        </article>
      </div>
    </main>
  );
}
