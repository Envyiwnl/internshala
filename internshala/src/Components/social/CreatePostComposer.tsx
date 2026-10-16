import {
  Globe2,
  Image as ImageIcon,
  Lock,
  Trash2,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { selectuser } from "@/feature/userSlice";
import { auth } from "@/firebase/firebase";
import { toast } from "react-toastify";

type Privacy = "public" | "friends" | "followers" | "private";

const API_URL = "https://internshala-78tb.onrender.com";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

type CreatePostComposerProps = {
  onPostCreated?: () => void;
};

export default function CreatePostComposer({
  onPostCreated,
}: CreatePostComposerProps) {
  const { t } = useTranslation();
  const user = useSelector(selectuser);

  const [text, setText] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("public");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (mediaPreview) {
        URL.revokeObjectURL(mediaPreview);
      }
    };
  }, [mediaPreview]);

  const handleMediaChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const isImage = IMAGE_TYPES.has(file.type);
    const isVideo = VIDEO_TYPES.has(file.type);

    if (!isImage && !isVideo) {
      toast.error(t("social.unsupportedMedia"));

      event.target.value = "";
      return;
    }

    if (isImage && file.size > MAX_IMAGE_SIZE) {
      toast.error(t("social.imageTooLarge"));

      event.target.value = "";
      return;
    }

    if (isVideo && file.size > MAX_VIDEO_SIZE) {
      toast.error(t("social.videoTooLarge"));

      event.target.value = "";
      return;
    }

    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview);
    }

    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const removeMedia = () => {
    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview);
    }

    setMediaFile(null);
    setMediaPreview("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCreatePost = async () => {
    const trimmedText = text.trim();

    if ((!trimmedText && !mediaFile) || isPosting) return;

    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      toast.error(t("social.loginRequired"));
      return;
    }

    setIsPosting(true);

    let uploadedMediaId = "";

    try {
      const idToken = await firebaseUser.getIdToken();

      if (mediaFile) {
        const formData = new FormData();

        formData.append("media", mediaFile);

        const mediaResponse = await fetch(`${API_URL}/api/media/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
          body: formData,
        });

        const mediaData = await mediaResponse.json();

        if (!mediaResponse.ok) {
          throw new Error(mediaData.error || "MEDIA_UPLOAD_FAILED");
        }

        uploadedMediaId = mediaData.media.id;
      }

      const postResponse = await fetch(`${API_URL}/api/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: trimmedText,
          privacy,
          ...(uploadedMediaId
            ? {
                mediaId: uploadedMediaId,
              }
            : {}),
        }),
      });

      const postData = await postResponse.json();

      if (!postResponse.ok) {
        if (uploadedMediaId) {
          try {
            await fetch(`${API_URL}/api/media/${uploadedMediaId}`, {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${idToken}`,
              },
            });
          } catch (cleanupError) {
            console.error("Staged media cleanup failed:", cleanupError);
          }
        }

        throw new Error(postData.error || "POST_CREATE_FAILED");
      }

      toast.success(t("social.postCreated"));

      setText("");
      setPrivacy("public");
      removeMedia();
      onPostCreated?.();
    } catch (error) {
      const errorCode =
        error instanceof Error ? error.message : "POST_CREATE_FAILED";

      const errorMessages: Record<string, string> = {
        POSTING_REQUIRES_FRIEND: t("social.postingRequiresFriend"),
        DAILY_POST_LIMIT_REACHED: t("social.dailyLimitReached"),
        DUPLICATE_POST: t("social.duplicatePost"),
        DUPLICATE_MEDIA: t("social.duplicateMedia"),
        MEDIA_TOO_LARGE: t("social.mediaTooLarge"),
        IMAGE_TOO_LARGE: t("social.imageTooLarge"),
        VIDEO_TOO_LARGE: t("social.videoTooLarge"),
        UNSUPPORTED_MEDIA_TYPE: t("social.unsupportedMedia"),
        MEDIA_UPLOAD_FAILED: t("social.mediaUploadFailed"),
        POST_CREATE_FAILED: t("social.postCreateFailed"),
        POST_CONTENT_REQUIRED: t("social.postContentRequired"),
        SOCIAL_RATE_LIMITED: t("social.rateLimited"),
      };

      toast.error(errorMessages[errorCode] || t("social.postCreateFailed"));
    } finally {
      setIsPosting(false);
    }
  };

  const privacyOptions = [
    {
      value: "public",
      label: t("social.privacyPublic"),
      icon: Globe2,
    },
    {
      value: "friends",
      label: t("social.privacyFriends"),
      icon: UsersRound,
    },
    {
      value: "followers",
      label: t("social.privacyFollowers"),
      icon: UserRoundCheck,
    },
    {
      value: "private",
      label: t("social.privacyPrivate"),
      icon: Lock,
    },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex gap-3">
        {user?.photo ? (
          <img
            src={user.photo}
            alt={user.name || t("navbar.userPhoto")}
            referrerPolicy="no-referrer"
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
            <UsersRound className="h-5 w-5 text-blue-600" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("social.createPostPlaceholder")}
            maxLength={3000}
            rows={4}
            className="w-full resize-none border-0 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
          />

          <div className="mt-1 text-right text-xs text-gray-400">
            {text.length}/3000
          </div>
        </div>
      </div>

      {mediaFile && mediaPreview && (
        <div className="relative mt-4 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={removeMedia}
            aria-label={t("social.removeMedia")}
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/75"
          >
            <X size={17} />
          </button>

          {mediaFile.type.startsWith("image/") ? (
            <img
              src={mediaPreview}
              alt={t("social.mediaPreview")}
              className="max-h-[420px] w-full object-contain"
            />
          ) : (
            <video
              src={mediaPreview}
              controls
              className="max-h-[420px] w-full"
            />
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
            onChange={handleMediaChange}
            className="hidden"
          />

          <button
            type="button"
            disabled={isPosting}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 hover:text-blue-600"
          >
            <ImageIcon size={18} />
            {t("social.photoVideo")}
          </button>

          {mediaFile && (
            <button
              type="button"
              onClick={removeMedia}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-500 transition hover:bg-red-50"
            >
              <Trash2 size={17} />
              {t("social.remove")}
            </button>
          )}

          <select
            value={privacy}
            disabled={isPosting}
            onChange={(event) => setPrivacy(event.target.value as Privacy)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 outline-none transition focus:border-blue-400"
          >
            {privacyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleCreatePost}
          disabled={(!text.trim() && !mediaFile) || isPosting}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {isPosting ? t("social.posting") : t("social.createPost")}
        </button>
      </div>
    </div>
  );
}
