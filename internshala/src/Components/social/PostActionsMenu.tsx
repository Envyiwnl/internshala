import { useEffect, useRef, useState } from "react";
import { Flag, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { auth } from "@/firebase/firebase";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";

const API_URL = "https://internshala-78tb.onrender.com";
const POST_MUTATION_WINDOW_MS = 30 * 60 * 1000;

type Privacy = "public" | "friends" | "followers" | "private";

type UpdatedPost = {
  text: string;
  privacy: Privacy;
  editedAt: string | null;
};

type ReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "misinformation"
  | "inappropriate"
  | "other";

type PostActionsMenuProps = {
  postId: string;
  text: string;
  privacy: Privacy;
  createdAt: string;
  isOwnPost: boolean;
  onPostUpdated: (post: UpdatedPost) => void;
  onPostDeleted: (postId: string) => void;
};

export default function PostActionsMenu({
  postId,
  text,
  privacy,
  createdAt,
  isOwnPost,
  onPostUpdated,
  onPostDeleted,
}: PostActionsMenuProps) {
  const { t } = useTranslation();

  const menuRef = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const [editText, setEditText] = useState(text);
  const [editPrivacy, setEditPrivacy] = useState<Privacy>(privacy);

  const [reportReason, setReportReason] = useState<ReportReason>("spam");
  const [reportDetails, setReportDetails] = useState("");

  const [busy, setBusy] = useState(false);

  const canMutate =
    Date.now() - new Date(createdAt).getTime() <= POST_MUTATION_WINDOW_MS;

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const getToken = async () => {
    await auth.authStateReady();

    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      throw new Error("LOGIN_REQUIRED");
    }

    return firebaseUser.getIdToken();
  };

  const openEdit = () => {
    setEditText(text);
    setEditPrivacy(privacy);
    setMenuOpen(false);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    const trimmedText = editText.trim();

    if (!trimmedText || busy) return;

    try {
      setBusy(true);

      const idToken = await getToken();

      const response = await fetch(`${API_URL}/api/posts/${postId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: trimmedText,
          privacy: editPrivacy,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "POST_EDIT_WINDOW_EXPIRED") {
          toast.error(t("social.postEditWindowExpired"));
          return;
        }

        if (data.error === "DUPLICATE_POST") {
          toast.error(t("social.duplicatePost"));
          return;
        }

        throw new Error(data.error || "POST_UPDATE_FAILED");
      }

      onPostUpdated({
        text: data.post.text,
        privacy: data.post.privacy,
        editedAt: data.post.editedAt,
      });

      setEditOpen(false);

      toast.success(t("social.postUpdated"));
    } catch (error) {
      console.error("Post update failed:", error);
      toast.error(t("social.postUpdateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;

    try {
      setBusy(true);

      const idToken = await getToken();

      const response = await fetch(`${API_URL}/api/posts/${postId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "POST_DELETE_WINDOW_EXPIRED") {
          toast.error(t("social.postDeleteWindowExpired"));
          return;
        }

        throw new Error(data.error || "POST_DELETE_FAILED");
      }

      onPostDeleted(postId);
      setDeleteOpen(false);

      toast.success(t("social.postDeleted"));
    } catch (error) {
      console.error("Post deletion failed:", error);
      toast.error(t("social.postDeleteFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleReport = async () => {
    if (busy) return;

    try {
      setBusy(true);

      const idToken = await getToken();

      const response = await fetch(`${API_URL}/api/posts/${postId}/reports`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: reportReason,
          details: reportDetails.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "POST_REPORT_FAILED");
      }

      setReportOpen(false);
      setReportReason("spam");
      setReportDetails("");

      toast.success(t("social.postReported"));
    } catch (error) {
      console.error("Post report failed:", error);
      toast.error(t("social.postReportFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          aria-label={t("social.postActions")}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <MoreHorizontal size={19} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-10 z-20 min-w-[180px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
            {isOwnPost ? (
              canMutate ? (
                <>
                  <button
                    type="button"
                    onClick={openEdit}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil size={16} />
                    {t("social.editPost")}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleteOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={16} />
                    {t("social.deletePost")}
                  </button>
                </>
              ) : (
                <p className="px-4 py-3 text-xs leading-5 text-gray-500">
                  {t("social.postMutationExpired")}
                </p>
              )
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <Flag size={16} />
                {t("social.reportPost")}
              </button>
            )}
          </div>
        )}
      </div>

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="font-semibold text-gray-900">
                {t("social.editPost")}
              </h2>

              <button
                type="button"
                disabled={busy}
                onClick={() => setEditOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <textarea
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                maxLength={3000}
                rows={6}
                disabled={busy}
                className="w-full resize-none rounded-xl border border-gray-200 px-3 py-3 text-sm text-gray-800 outline-none focus:border-blue-400"
              />

              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{t("social.postEditTimeNotice")}</span>

                <span>{editText.length}/3000</span>
              </div>

              <select
                value={editPrivacy}
                disabled={busy}
                onChange={(event) =>
                  setEditPrivacy(event.target.value as Privacy)
                }
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-400"
              >
                <option value="public">{t("social.privacyPublic")}</option>

                <option value="friends">{t("social.privacyFriends")}</option>

                <option value="followers">
                  {t("social.privacyFollowers")}
                </option>

                <option value="private">{t("social.privacyPrivate")}</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                {t("common.cancel")}
              </button>

              <button
                type="button"
                disabled={!editText.trim() || busy}
                onClick={handleEdit}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {busy ? t("social.updatingPost") : t("social.savePostChanges")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">
              {t("social.deletePost")}
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-600">
              {t("social.deletePostConfirmation")}
            </p>

            <p className="mt-2 text-xs text-gray-400">
              {t("social.deletePostQuotaNotice")}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleteOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                {t("common.cancel")}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={handleDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? t("social.deletingPost") : t("social.deletePost")}
              </button>
            </div>
          </div>
        </div>
      )}

      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="font-semibold text-gray-900">
                {t("social.reportPost")}
              </h2>

              <button
                type="button"
                disabled={busy}
                onClick={() => setReportOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  {t("social.reportReason")}
                </label>

                <select
                  value={reportReason}
                  disabled={busy}
                  onChange={(event) =>
                    setReportReason(event.target.value as ReportReason)
                  }
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                >
                  <option value="spam">{t("social.reportSpam")}</option>

                  <option value="harassment">
                    {t("social.reportHarassment")}
                  </option>

                  <option value="hate">{t("social.reportHate")}</option>

                  <option value="misinformation">
                    {t("social.reportMisinformation")}
                  </option>

                  <option value="inappropriate">
                    {t("social.reportInappropriate")}
                  </option>

                  <option value="other">{t("social.reportOther")}</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  {t("social.reportDetails")}
                </label>

                <textarea
                  value={reportDetails}
                  onChange={(event) => setReportDetails(event.target.value)}
                  maxLength={500}
                  rows={4}
                  disabled={busy}
                  placeholder={t("social.reportDetailsPlaceholder")}
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                />

                <p className="mt-1 text-right text-xs text-gray-400">
                  {reportDetails.length}/500
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => setReportOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                {t("common.cancel")}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={handleReport}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? t("social.submittingReport") : t("social.submitReport")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
