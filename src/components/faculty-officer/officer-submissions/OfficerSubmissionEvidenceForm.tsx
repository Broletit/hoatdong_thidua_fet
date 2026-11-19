"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { Upload, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { saveOfficerSubmissionEvidence } from "@/server/actions/officer-submissions/saveOfficerSubmissionEvidence";
import { submitOfficerSubmission } from "@/server/actions/officer-submissions/submitOfficerSubmission";
import ActionFeedback from "@/components/shared/ActionFeedback";
import { AutoCriteriaBadge, AutoCriteriaMessage } from "@/components/shared/criteria/AutoCriteriaAchievement";
import { getUserFacingActionError } from "@/lib/errors/getUserFacingActionError";

type EvidenceUnitItem = {
  id: number;
  note: string | null;
  fileId?: number | null;
  fileName: string | null;
  reviewDecision?: string | null;
};

type Item = {
  code: string;
  title: string;
  description: string | null;
  group_code: string;
  group_title: string;
  min_required: number;
  required_count?: number;
  score_max: number;
  evidence_type?: string;
  is_required: number;
  auto_passed: number | null;
  auto_message: string | null;
  content_text: string | null;
  file_name: string | null;
  file_id?: number | null;
  file_path: string | null;
  file_count: number;
  auto_score: number;
  matched_activity_titles: string | null;
  review_decision: string | null;
  evidence_units?: EvidenceUnitItem[];
};

const allowedFileExtensions = [".pdf", ".png", ".jpg", ".jpeg"];
const maxFileSize = 10 * 1024 * 1024;
const maxRequestFileSize = 45 * 1024 * 1024;
type FileState = Record<string, { name: string; error: string }>;

export default function OfficerSubmissionEvidenceForm({
  submissionId,
  canEdit,
  items,
}: {
  submissionId: number;
  canEdit: boolean;
  items: Item[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [fileStates, setFileStates] = useState<FileState>({});
  const [noteStates, setNoteStates] = useState<Record<string, string>>({});
  const [missingEvidence, setMissingEvidence] = useState<string[]>([]);
  const [flashingTarget, setFlashingTarget] = useState<string | null>(null);
  const [deletedSlotKeys, setDeletedSlotKeys] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});

  const focusAndFlashCriterion = (code: string) => {
    setFlashingTarget(code);
    setTimeout(() => {
      const element = document.getElementById(`officer-criterion-${code}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = element?.querySelector<HTMLElement>(
        '[data-failed-slot="true"] textarea:not(:disabled), [data-failed-slot="true"] input:not(:disabled), textarea:not(:disabled), input:not(:disabled)'
      );
      focusable?.focus({ preventScroll: true });
    }, 80);
    setTimeout(() => {
      setFlashingTarget(current => (current === code ? null : current));
    }, 4500);
  };

  const groups = Array.from(
    new Map(
      items.map((item) => [
        item.group_code,
        { code: item.group_code, title: item.group_title, minRequired: Number(item.min_required) },
      ])
    ).values()
  );
  const evidenceNotNeeded=(item:Item)=>Number(item.is_required)!==1&&items.filter(candidate=>candidate.group_code===item.group_code&&Number(candidate.auto_passed)===1).length>=Math.max(Number(item.min_required),items.filter(candidate=>candidate.group_code===item.group_code&&Number(candidate.is_required)===1).length);

  function handleFileChange(fieldKey: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      setFileStates((current) => ({ ...current, [fieldKey]: { name: "", error: "" } }));
      return;
    }

    const extension = file.name.includes(".")
      ? `.${file.name.split(".").pop()?.toLowerCase()}`
      : "";
    let error = "";
    if (!allowedFileExtensions.includes(extension)) {
      error = "Định dạng không hợp lệ. Minh chứng chỉ chấp nhận tệp PDF, PNG, JPG hoặc JPEG.";
    } else if (file.size > maxFileSize) {
      error = "Tệp vượt quá dung lượng tối đa 10 MB.";
    }

    if (error) {
      event.currentTarget.value = "";
      setFileStates((current) => ({ ...current, [fieldKey]: { name: file.name, error } }));
      toast.error(error, { id: `officer-evidence-file-${fieldKey}` });
      return;
    }

    setFileStates((current) => ({ ...current, [fieldKey]: { name: file.name, error: "" } }));
    toast.success(`Tệp “${file.name}” hợp lệ và sẵn sàng tải lên.`, { id: `officer-evidence-file-${fieldKey}` });
  }

  async function handleDeleteFile(fieldKey: string, existingFileId?: number | null) {
    const localFile = fileStates[fieldKey]?.name;
    const inputEl = document.querySelector<HTMLInputElement>(`input[name="file_${fieldKey}"]`);
    if (inputEl) {
      inputEl.value = "";
    }

    if (localFile) {
      setFileStates((prev) => {
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
      toast.success("Đã bỏ chọn tệp mới.");
      return;
    }

    if (existingFileId) {
      const confirmDelete = window.confirm("Bạn có chắc chắn muốn xóa tệp minh chứng này không?");
      if (!confirmDelete) return;

      setIsDeleting((prev) => ({ ...prev, [fieldKey]: true }));
      try {
        const res = await fetch(`/api/submissions/files/${existingFileId}`, {
          method: "DELETE",
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          toast.success("Đã xóa minh chứng.");
          setDeletedSlotKeys((prev) => new Set(prev).add(fieldKey));
          router.refresh();
        } else {
          toast.error(data.message || "Không thể xóa minh chứng.");
        }
      } catch {
        toast.error("Lỗi kết nối khi xóa minh chứng.");
      } finally {
        setIsDeleting((prev) => ({ ...prev, [fieldKey]: false }));
      }
    }
  }

  function handleSave(formData: FormData) {
    setMessage("");

    const totalFileSize=[...formData.values()].reduce((total,value)=>total+(value instanceof File?value.size:0),0);
    if(totalFileSize>maxRequestFileSize){setOk(false);setMessage("Tổng dung lượng các tệp trong một lần lưu không được vượt quá 45 MB. Vui lòng lưu thành nhiều lần.");return;}

    startTransition(async () => {
      try {
        const result = await saveOfficerSubmissionEvidence(submissionId, formData);
        setOk(true);
        setMessage(result.message || "Đã lưu minh chứng.");
        setFileStates({});
        setNoteStates({});
        setMissingEvidence([]);
        router.refresh();
      } catch (error) {
        setOk(false);
        setMessage(getUserFacingActionError(error, "Không thể lưu minh chứng."));
      }
    });
  }

  function handleSubmit() {
    setMessage("");
    const failedCriteria = items.filter(
      item =>
        item.review_decision === "fail" ||
        (item.evidence_units?.some(u => u.reviewDecision === "fail") ?? false)
    );
    if (failedCriteria.length > 0) {
      const failedCodes = failedCriteria.map(item => item.code);
      setMissingEvidence(failedCodes);
      const msg = `Bạn cần cập nhật và nhấn “Lưu minh chứng” cho các minh chứng chưa đạt (${failedCodes.join(", ")}) trước khi hoàn tất hồ sơ.`;
      setOk(false);
      setMessage(msg);
      toast.error(msg, { id: `officer-submit-failed-${submissionId}` });
      focusAndFlashCriterion(failedCodes[0]);
      return;
    }

    startTransition(async () => {
      try {
        const result = await submitOfficerSubmission(submissionId);
        setOk(true);
        setMessage(result.message || "Đã hoàn tất hồ sơ.");
        setMissingEvidence([]);
        router.refresh();
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Không thể hoàn tất hồ sơ.";
        setOk(false);
        setMessage(errMsg);
        toast.error(errMsg, { id: `officer-submit-err-${submissionId}` });
      }
    });
  }

  return (
    <section className="rounded-3xl bg-white p-6 shadow-md ring-1 ring-slate-100 shadow-slate-200/60">
      <ActionFeedback pending={pending} message={message} ok={ok} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-900">Minh chứng hồ sơ</h2>

        {!canEdit ? (
          <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
            Hồ sơ không ở trạng thái chỉnh sửa
          </span>
        ) : null}
      </div>

      <form action={handleSave} className="mt-5 space-y-5">
        {groups.map((group) => {
          const groupItems = items.filter((item) => item.group_code === group.code);

          return (
            <div key={group.code} className="overflow-hidden rounded-none border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-blue-700 bg-blue-50 px-5 py-3.5">
                <h3 className="text-base font-semibold text-blue-950">
                  {group.code}. {group.title}
                </h3>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="text-sm font-semibold text-blue-900">Yêu cầu: Đạt tối thiểu {Math.max(group.minRequired,groupItems.filter(item=>Number(item.is_required)===1).length)}/{groupItems.length} tiêu chí</span>
                  {(() => {
                    const maxScore = groupItems.reduce((total, item) => total + Number(item.score_max), 0);
                    const submittedScore = groupItems.reduce((total, item) => {
                      const hasEvidence = Number(item.auto_passed ?? 0) === 1 || (item.review_decision !== "fail" && (Boolean(item.content_text?.trim()) || Number(item.file_count) > 0));
                      const awarded = Number(item.auto_passed ?? 0) === 1
                        ? Math.min(Number(item.score_max), Number(item.auto_score) || Number(item.score_max))
                        : Number(item.score_max);
                      return total + (hasEvidence ? awarded : 0);
                    }, 0);
                    const approvedScore = groupItems.reduce((total, item) => {
                      const passed = Number(item.auto_passed ?? 0) === 1 || item.review_decision === "pass";
                      const awarded = Number(item.auto_passed ?? 0) === 1
                        ? Math.min(Number(item.score_max), Number(item.auto_score) || Number(item.score_max))
                        : Number(item.score_max);
                      return total + (passed ? awarded : 0);
                    }, 0);
                    return (
                      <>
                        <span className="text-sm font-bold text-blue-700">Đã nộp {submittedScore}/{maxScore} điểm</span>
                        {approvedScore > 0 ? <span className="text-sm font-bold text-emerald-700">Đã đạt {approvedScore}/{maxScore} điểm</span> : null}
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {groupItems.map((item) => {
                  const autoPassed = Number(item.auto_passed ?? 0) === 1;
                  const isDescriptionOnly = item.evidence_type === "manual";
                  const isLockedPass = autoPassed || item.review_decision === "pass";
                  const isDisabled = !canEdit || pending || isLockedPass || evidenceNotNeeded(item);
                  const reqCount = Math.max(1, Number(item.required_count ?? 1));
                  let uploadedCount = 0;
                  let failedUnresolvedCount = 0;
                  for (let s = 0; s < reqCount; s++) {
                    const u = item.evidence_units?.[s];
                    const fk = `${item.code}_${s}`;
                    const hasNewValid = Boolean(fileStates[fk]?.name && !fileStates[fk]?.error);
                    const existFile = u?.fileName ?? (s === 0 && !item.evidence_units?.length ? item.file_name : null);
                    const unitFail = u?.reviewDecision === "fail" || (!item.evidence_units?.length && item.review_decision === "fail");
                    const nState = noteStates[fk];
                    const origN = (u?.note ?? (s === 0 && !item.evidence_units?.length ? item.content_text : "") ?? "").trim();
                    const noteEdited = nState !== undefined && nState.trim() !== origN;
                    if (hasNewValid || existFile) uploadedCount++;
                    if (unitFail && !hasNewValid && !noteEdited) failedUnresolvedCount++;
                  }
                  const currentManualNote = (noteStates[item.code] ?? item.content_text ?? "").trim();
                  const isManualEdited = noteStates[item.code] !== undefined && currentManualNote !== (item.content_text ?? "").trim();
                  const isManualFailedUnresolved = isDescriptionOnly && item.review_decision === "fail" && !isManualEdited;
                  const isManualSatisfied = isDescriptionOnly && Boolean(currentManualNote) && !isManualFailedUnresolved;
                  const hasEvidence = isDescriptionOnly
                    ? isManualSatisfied
                    : uploadedCount >= reqCount && failedUnresolvedCount === 0;
                  const isFlashing = flashingTarget === item.code;
                  const isItemFailed = isDescriptionOnly ? isManualFailedUnresolved : failedUnresolvedCount > 0;
                  const isItemMissingUnresolved = missingEvidence.includes(item.code) && !hasEvidence;
                  return (
                    <div
                      key={item.code}
                      id={`officer-criterion-${item.code}`}
                      className={`scroll-mt-24 p-5 transition-all duration-300 ${
                        isFlashing
                          ? "bg-red-50/25"
                          : isItemFailed || isItemMissingUnresolved
                            ? "bg-red-50/10"
                            : ""
                      }`}
                    >
                      <input type="hidden" name="criteriaCode" value={item.code} />

                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-900">
                            {item.code}. {item.title}
                          </div>

                          <div className="mt-1 text-sm text-slate-500">
                            {item.description || "Chưa có mô tả"}
                          </div>
                          {!autoPassed && (item.auto_message || item.matched_activity_titles) ? (
                            <AutoCriteriaMessage
                              message={item.auto_message}
                              matchedActivityTitles={item.matched_activity_titles}
                            />
                          ) : null}
                        </div>

                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-xs font-medium">
                            <span className={Number(item.is_required) === 1 ? "inline-flex items-center whitespace-nowrap rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-700 ring-1 ring-rose-200" : "inline-flex items-center whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600 ring-1 ring-slate-200"}>
                              {Number(item.is_required) === 1 ? "Bắt buộc" : "Không bắt buộc"}
                            </span>
                            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700 ring-1 ring-blue-200">
                              Tối đa {Number(item.score_max ?? 0)} điểm
                            </span>
                            {autoPassed ? (
                              <AutoCriteriaBadge/>
                            ) : item.review_decision === "pass" ? (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-200">Đã đạt</span>
                            ) : isItemFailed ? (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-700 ring-1 ring-rose-200">Chưa đạt</span>
                            ) : evidenceNotNeeded(item) ? (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600 ring-1 ring-slate-200">Không cần bổ sung</span>
                            ) : isDescriptionOnly ? (
                              isManualSatisfied ? (
                                <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                  Đã nhập mô tả
                                </span>
                              ) : (
                                <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700 ring-1 ring-amber-200">
                                  Cần nhập mô tả
                                </span>
                              )
                            ) : hasEvidence ? (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                {reqCount > 1 ? `Đã nộp đủ ${uploadedCount}/${reqCount} minh chứng` : "Đã nộp minh chứng"}
                              </span>
                            ) : uploadedCount > 0 ? (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700 ring-1 ring-amber-200">
                                Đã nộp {uploadedCount}/{reqCount} minh chứng
                              </span>
                            ) : (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700 ring-1 ring-amber-200">
                                {reqCount > 1 ? `Cần ${reqCount} minh chứng` : "Cần minh chứng"}
                              </span>
                            )}
                          </div>
                      </div>

                      {autoPassed ? (
                        <AutoCriteriaMessage
                          message={item.auto_message || "Điểm rèn luyện đã được ghi nhận"}
                          matchedActivityTitles={item.matched_activity_titles}
                        />
                      ) : isDescriptionOnly ? (
                        <div className="mt-4">
                          <textarea
                            name={`note_${item.code}`}
                            disabled={isDisabled}
                            readOnly={item.review_decision === "pass"}
                            defaultValue={item.content_text ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNoteStates((prev) => ({ ...prev, [item.code]: val }));
                              if (val.trim()) {
                                setMissingEvidence((prev) => prev.filter((c) => c !== item.code));
                              }
                            }}
                            rows={3}
                            placeholder="Nhập nội dung mô tả..."
                            className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition-colors duration-200 focus:border-blue-500 disabled:bg-slate-50 ${
                              isManualFailedUnresolved || (missingEvidence.includes(item.code) && !currentManualNote)
                                ? `bg-red-50/30 ${isFlashing ? "border-red-600" : "border-red-500"}`
                                : isManualSatisfied
                                  ? "border-emerald-500 bg-emerald-50/20"
                                  : "border-slate-200"
                            }`}
                          />
                        </div>
                      ) : (
                        <div className="mt-4 space-y-3">
                          {Array.from({ length: reqCount }).map((_, slot) => {
                            const unit = item.evidence_units?.[slot];
                            const fieldKey = `${item.code}_${slot}`;
                            const unitFileId = unit?.fileId ?? (slot === 0 && !item.evidence_units?.length ? item.file_id : null);
                            const rawFileName = unit?.fileName ?? (slot === 0 && !item.evidence_units?.length ? item.file_name : null);
                            const isDeleted = deletedSlotKeys.has(fieldKey);
                            const existingFileName = isDeleted ? null : rawFileName;
                            const existingFileId = isDeleted ? null : unitFileId;
                            const existingNote = unit?.note ?? (slot === 0 && !item.evidence_units?.length ? item.content_text : "");
                            const isSlotLockedPass = item.review_decision === "pass" || unit?.reviewDecision === "pass";
                            const hasValidNewFile = Boolean(fileStates[fieldKey]?.name && !fileStates[fieldKey]?.error);
                            const hasAnyFile = hasValidNewFile || Boolean(existingFileName);
                            const displayedFileName = fileStates[fieldKey]?.name || existingFileName;
                            const isSlotFailed = !isSlotLockedPass && (unit?.reviewDecision === "fail" || (!item.evidence_units?.length && item.review_decision === "fail"));
                            const isSlotMissing = !isSlotLockedPass && missingEvidence.includes(item.code) && (!existingFileName || isSlotFailed);
                            const isSlotHighlighted = isSlotFailed || isSlotMissing || Boolean(fileStates[fieldKey]?.error);
                            const isSlotDisabled = isDisabled || isSlotLockedPass;
                            return (
                              <div
                                key={fieldKey}
                                data-failed-slot={isSlotHighlighted ? "true" : undefined}
                                className="space-y-1.5 transition-all duration-300"
                              >
                                {reqCount > 1 || isSlotFailed ? (
                                  <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                                    <span>{reqCount > 1 ? `Minh chứng ${slot + 1}/{reqCount}` : "Minh chứng"}</span>
                                    {isSlotLockedPass ? (
                                      <span className="rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">Đã đạt</span>
                                    ) : isSlotFailed ? (
                                      <span className="rounded bg-rose-100 px-2.5 py-0.5 font-semibold text-rose-700 ring-1 ring-rose-300">Chưa đạt - Cần cập nhật lại</span>
                                    ) : null}
                                  </div>
                                ) : null}
                                <input type="hidden" name={`unitId_${fieldKey}`} value={unit?.id ? String(unit.id) : ""} />
                                <div className="grid gap-3 lg:grid-cols-10">
                                  <textarea
                                    name={`note_${fieldKey}`}
                                    disabled={isSlotDisabled}
                                    readOnly={isSlotLockedPass}
                                    defaultValue={existingNote ?? ""}
                                    rows={2}
                                    placeholder={reqCount > 1 ? `Nhập mô tả minh chứng ${slot + 1}...` : "Nhập mô tả minh chứng..."}
                                    className={`h-20 min-h-20 max-h-20 w-full resize-y overflow-y-auto rounded-none border px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-50 lg:col-span-5 ${
                                      isSlotHighlighted
                                        ? `bg-white ${isFlashing ? "border-red-600" : "border-red-500"}`
                                        : "border-slate-200"
                                    }`}
                                  />

                                  <div className={`rounded-none border p-3 transition-colors duration-200 lg:col-span-5 ${fileStates[fieldKey]?.error || isSlotHighlighted ? `bg-red-50/40 ${isFlashing ? "border-red-600" : "border-red-500"}` : fileStates[fieldKey]?.name ? "border-emerald-500 bg-emerald-50" : existingFileName ? "border-blue-300 bg-blue-50/50" : "border-slate-200 bg-slate-50"}`}>
                                    <div className="flex flex-wrap items-center gap-3">
                                    <label className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold ${!isSlotDisabled ? (isSlotHighlighted ? "cursor-pointer bg-red-600 text-white hover:bg-red-700" : "cursor-pointer bg-blue-700 text-white") : "cursor-not-allowed bg-slate-200 text-slate-400"}`}>
                                      <Upload size={14} />
                                      {hasAnyFile ? "Thay thế tệp" : isSlotFailed ? "Tải lại tệp" : "Tải tệp"}
                                      <input
                                        type="file"
                                        name={`file_${fieldKey}`}
                                        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                                        disabled={isSlotDisabled}
                                        className="hidden"
                                        aria-invalid={isSlotHighlighted}
                                        onChange={(event) => handleFileChange(fieldKey, event)}
                                      />
                                    </label>

                                    <div className="flex min-w-0 flex-1 items-center text-xs text-slate-600">
                                      {existingFileId && !hasValidNewFile ? (
                                        <a
                                          href={`/api/submissions/files/${existingFileId}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          title="Nhấp để xem minh chứng đã nộp trên tab mới"
                                          className="truncate font-medium text-blue-700 hover:text-blue-900 underline underline-offset-2"
                                        >
                                          {displayedFileName}
                                        </a>
                                      ) : (
                                        <span className="truncate">
                                          {displayedFileName || "Chưa có tệp được chọn"}
                                        </span>
                                      )}
                                    </div>

                                    {hasAnyFile && !isSlotLockedPass && !isSlotDisabled ? (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteFile(fieldKey, existingFileId)}
                                        disabled={Boolean(isDeleting[fieldKey])}
                                        title={hasValidNewFile ? "Bỏ tệp vừa chọn" : "Xóa tệp minh chứng này"}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 hover:text-rose-800 transition-colors border border-rose-200 shrink-0 disabled:opacity-50"
                                      >
                                        <Trash2 size={13} />
                                        <span>{isDeleting[fieldKey] ? "Đang xóa..." : "Xóa"}</span>
                                      </button>
                                    ) : null}
                                    </div>
                                    {fileStates[fieldKey]?.error ? (
                                      <p className="mt-2 text-xs font-medium text-red-700">{fileStates[fieldKey].error}</p>
                                    ) : isSlotFailed && !fileStates[fieldKey]?.name ? (
                                      <p className="mt-2 text-xs font-semibold text-red-700">Minh chứng này được đánh giá Chưa đạt. Vui lòng tải tệp mới hoặc chỉnh sửa rồi nhấn “Lưu minh chứng”.</p>
                                    ) : (
                                      <p className="mt-2 text-xs text-slate-500">Chỉ nhận PDF, PNG, JPG hoặc JPEG ≤ 10 MB.</p>
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
                })}
              </div>
            </div>
          );
        })}


        {canEdit ? <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
          >
            {pending ? "Đang lưu..." : "Lưu minh chứng"}
          </button>
        </div> : null}
      </form>

      {canEdit ? (
        <div className="mt-5 flex justify-end rounded-none border border-amber-200 bg-amber-50/60 p-4 shadow-md shadow-slate-200/60">
          <button
            type="button"
            disabled={pending}
            onClick={handleSubmit}
            className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
          >
            {pending ? "Đang gửi..." : "Hoàn tất hồ sơ"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
