import { SubmitEvent, useEffect, useState } from "react";
import { Check, Pencil, Trash2, UserRound, X } from "lucide-react";
import { auth } from "@/firebase/firebase";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";

const API_URL = "https://internshala-78tb.onrender.com";

type CommentAuthor = {
  id: string;
  username: string;
  name: string;
  photo: string;
};

type PostComment = {
  id: string;
  author: CommentAuthor;
  text: string;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PostCommentsProps = {
  postId: string;
  currentUserId: string;
  onCommentCountChange: (count: number) => void;
};

export default function PostComments({
  postId,
  currentUserId,
  onCommentCountChange,
}: PostCommentsProps) {
  const { t } = useTranslation();

  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingText, setEditingText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyCommentId, setBusyCommentId] = useState("");
  const [error, setError] = useState("");

  const getToken = async () => {
    await auth.authStateReady();

    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      throw new Error("LOGIN_REQUIRED");
    }

    return firebaseUser.getIdToken();
  };

  const loadComments = async () => {
    try {
      setLoading(true);
      setError("");

      const idToken = await getToken();

      const response = await fetch(`${API_URL}/api/posts/${postId}/comments`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "COMMENTS_FETCH_FAILED");
      }

      setComments(data.comments || []);
      onCommentCountChange(data.count || 0);
    } catch (error) {
      console.error("Comments fetch failed:", error);
      setError(t("social.commentsLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [postId]);

  const handleCreateComment = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const text = commentText.trim();

    if (!text || submitting) return;

    try {
      setSubmitting(true);

      const idToken = await getToken();

      const response = await fetch(`${API_URL}/api/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "SOCIAL_RATE_LIMITED") {
          toast.error(t("social.rateLimited"));
          return;
        }

        if (data.error === "CONTENT_REJECTED") {
          toast.error(t("social.contentRejected"));
          return;
        }

        throw new Error(data.error || "COMMENT_CREATE_FAILED");
      }

      setComments((current) => [...current, data.comment]);
      setCommentText("");
      onCommentCountChange(data.commentCount);

      toast.success(t("social.commentAdded"));
    } catch (error) {
      console.error("Comment creation failed:", error);
      toast.error(t("social.commentCreateFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const startEditing = (comment: PostComment) => {
    setEditingId(comment.id);
    setEditingText(comment.text);
  };

  const cancelEditing = () => {
    setEditingId("");
    setEditingText("");
  };

  const saveEditedComment = async (commentId: string) => {
    const text = editingText.trim();

    if (!text || busyCommentId) return;

    try {
      setBusyCommentId(commentId);

      const idToken = await getToken();

      const response = await fetch(
        `${API_URL}/api/posts/${postId}/comments/${commentId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "CONTENT_REJECTED") {
          toast.error(t("social.contentRejected"));
          return;
        }

        throw new Error(data.error || "COMMENT_UPDATE_FAILED");
      }

      setComments((current) =>
        current.map((comment) =>
          comment.id === commentId ? data.comment : comment,
        ),
      );

      cancelEditing();

      toast.success(t("social.commentUpdated"));
    } catch (error) {
      console.error("Comment update failed:", error);
      toast.error(t("social.commentUpdateFailed"));
    } finally {
      setBusyCommentId("");
    }
  };

  const deleteComment = async (commentId: string) => {
    if (busyCommentId) return;

    try {
      setBusyCommentId(commentId);

      const idToken = await getToken();

      const response = await fetch(
        `${API_URL}/api/posts/${postId}/comments/${commentId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "COMMENT_DELETE_FAILED");
      }

      setComments((current) =>
        current.filter((comment) => comment.id !== commentId),
      );

      onCommentCountChange(data.commentCount);

      toast.success(t("social.commentDeleted"));
    } catch (error) {
      console.error("Comment deletion failed:", error);
      toast.error(t("social.commentDeleteFailed"));
    } finally {
      setBusyCommentId("");
    }
  };

  const formatDate = (value: string) => {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  };

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
      <form onSubmit={handleCreateComment} className="flex items-start gap-2">
        <textarea
          value={commentText}
          onChange={(event) => setCommentText(event.target.value)}
          placeholder={t("social.writeComment")}
          rows={2}
          disabled={submitting}
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-400 disabled:bg-gray-100"
        />

        <button
          type="submit"
          disabled={!commentText.trim() || submitting}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {submitting ? t("social.commentPosting") : t("social.postComment")}
        </button>
      </form>

      {loading && (
        <p className="py-6 text-center text-sm text-gray-500">
          {t("common.loading")}
        </p>
      )}

      {!loading && error && (
        <div className="py-6 text-center">
          <p className="text-sm text-red-500">{error}</p>

          <button
            type="button"
            onClick={loadComments}
            className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            {t("social.retry")}
          </button>
        </div>
      )}

      {!loading && !error && !comments.length && (
        <p className="py-6 text-center text-sm text-gray-500">
          {t("social.noComments")}
        </p>
      )}

      {!loading && !error && comments.length > 0 && (
        <div className="mt-4 space-y-3">
          {comments.map((comment) => {
            const isOwnComment = comment.author.id === currentUserId;

            const isEditing = editingId === comment.id;
            const isBusy = busyCommentId === comment.id;

            return (
              <div
                key={comment.id}
                className="rounded-xl border border-gray-200 bg-white p-3"
              >
                <div className="flex items-start gap-3">
                  {comment.author.photo ? (
                    <img
                      src={comment.author.photo}
                      alt={comment.author.name || comment.author.username}
                      referrerPolicy="no-referrer"
                      className="h-9 w-9 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100">
                      <UserRound className="h-4 w-4 text-gray-500" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {comment.author.name || comment.author.username}
                        </p>

                        <div className="flex flex-wrap items-center gap-1 text-xs text-gray-400">
                          <span>@{comment.author.username}</span>
                          <span>•</span>
                          <span>{formatDate(comment.createdAt)}</span>

                          {comment.editedAt && (
                            <>
                              <span>•</span>
                              <span>{t("social.edited")}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {isOwnComment && !isEditing && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => startEditing(comment)}
                            aria-label={t("social.editComment")}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-50"
                          >
                            <Pencil size={15} />
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => deleteComment(comment.id)}
                            aria-label={t("social.deleteComment")}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="mt-3">
                        <textarea
                          value={editingText}
                          onChange={(event) =>
                            setEditingText(event.target.value)
                          }
                          rows={2}
                          disabled={isBusy}
                          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                        />

                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={cancelEditing}
                            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                          >
                            <X size={15} />
                            {t("common.cancel")}
                          </button>

                          <button
                            type="button"
                            disabled={!editingText.trim() || isBusy}
                            onClick={() => saveEditedComment(comment.id)}
                            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
                          >
                            <Check size={15} />
                            {t("common.save")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5 text-gray-700">
                        {comment.text}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
