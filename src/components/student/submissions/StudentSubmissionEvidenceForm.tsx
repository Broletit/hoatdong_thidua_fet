"use client";
import RequiredMark from "@/components/common/RequiredMark";
import ExpandableText from "@/components/common/ExpandableText";

import { useActionState, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Upload, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { saveStudentSubmissionEvidence } from "@/server/actions/submissions/saveStudentSubmissionEvidence";
import { submitStudentSubmission } from "@/server/actions/submissions/submitStudentSubmission";
import { requestSubmissionSupport } from "@/server/actions/submissions/requestSubmissionSupport";
import ActionFeedback from "@/components/shared/ActionFeedback";
import { AutoCriteriaBadge, AutoCriteriaMessage } from "@/components/shared/criteria/AutoCriteriaAchievement";
import { getUserFacingActionError } from "@/lib/errors/getUserFacingActionError";
import CriteriaGroupsPagination from "@/components/shared/criteria/CriteriaGroupsPagination";
import Link from "next/link";
import TableResultsFooter from "@/components/common/TableResultsFooter";
import { scrollToTable } from "@/lib/ui/scrollToTable";

export type EvidenceUnitItem = {
  id: number;
  note: string | null;
  fileId?: number | null;
  fileName: string | null;
  reviewDecision?: string | null;
};

type CriteriaItem = {
  code: string;
  title: string;
  description: string | null;
  groupCode: string;
  groupTitle: string;
  minRequired: number;
  requiredCount: number;
  evidenceType?: string;
  isRequired: boolean;
  autoPassed: boolean;
  autoMessage: string | null;
  contentText: string | null;
  fileId?: number | null;
  fileName: string | null;
  reviewDecision?: string | null;
  evidenceUnits?: EvidenceUnitItem[];
};

type State = {
  ok: boolean;
  message: string;
};

const initialState: State = { ok: false, message: "" };
const allowedFileExtensions = [".pdf", ".png", ".jpg", ".jpeg"];
const maxFileSize = 10 * 1024 * 1024;
const maxRequestFileSize = 45 * 1024 * 1024;
type FileState = Record<string, { name: string; error: string }>;
function CriteriaItemPager({items,externalPage,children}:{items:CriteriaItem[];externalPage?:{page:number;token:number}|null;children:(item:CriteriaItem)=>ReactNode}){
  const[manualState,setManualState]=useState<{page:number;token:number}>({page:1,token:-1});
  const top=useRef<HTMLSpanElement>(null);
  const previousPage=useRef(1);
  const totalPages=Math.max(1,Math.ceil(items.length/5));
  const useExternal=Boolean(externalPage&&externalPage.token>manualState.token&&externalPage.page>=1&&externalPage.page<=totalPages);
  const current=Math.min(useExternal?externalPage!.page:manualState.page,totalPages);
  const start=(current-1)*5;
  const setPage=(updater:(prev:number)=>number)=>{
    setManualState(prev=>({page:updater(useExternal?externalPage!.page:prev.page),token:externalPage?.token??prev.token}));
  };
  useLayoutEffect(()=>{
    if(previousPage.current===current)return;
    previousPage.current=current;
    scrollToTable(top.current?.parentElement ?? top.current);
  },[current]);
  return <><span ref={top} className="block scroll-mt-4"/>{items.map((item,index)=><div key={item.code} hidden={index<start||index>=start+5}>{children(item)}</div>)}{items.length>5?<TableResultsFooter totalResults={items.length} resultLabel="tiêu chí"><button type="button" onClick={()=>setPage(value=>Math.max(1,value-1))} disabled={current===1} className="px-3 disabled:text-slate-300">‹</button><span className="text-sm text-slate-500">Trang {current}/{totalPages}</span><button type="button" onClick={()=>setPage(value=>Math.min(totalPages,value+1))} disabled={current===totalPages} className="px-3 disabled:text-slate-300">›</button></TableResultsFooter>:null}</>;
}

export default function StudentSubmissionEvidenceForm({
  submissionId,
  criteria,
  canEdit,
  viewHref,
}: {
  submissionId: number;
  criteria: CriteriaItem[];
  canEdit: boolean;
  viewHref?: string;
}) {
  const router = useRouter();
  const [fileStates, setFileStates] = useState<FileState>({});
  const [noteStates, setNoteStates] = useState<Record<string, string>>({});
  const [deletedSlotKeys, setDeletedSlotKeys] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});
  const [missingEvidence, setMissingEvidence] = useState<string[]>([]);
  const [groupErrors, setGroupErrors] = useState<Record<string, string>>({});
  const [flashingTarget, setFlashingTarget] = useState<string | null>(null);
  const [supportError, setSupportError] = useState("");
  const [supportNoteValue, setSupportNoteValue] = useState("");
  const supportNoteRef = useRef<HTMLTextAreaElement>(null);
  const [externalGroupPage, setExternalGroupPage] = useState<{ page: number; token: number } | null>(null);
  const [externalItemPages, setExternalItemPages] = useState<Record<string, { page: number; token: number }>>({});
  const evidenceNotNeeded=(item:CriteriaItem)=>!item.isRequired&&criteria.filter(candidate=>candidate.groupCode===item.groupCode&&(candidate.autoPassed||candidate.reviewDecision==="pass")).length>=Math.max(item.minRequired,criteria.filter(candidate=>candidate.groupCode===item.groupCode&&candidate.isRequired).length);
  const isDescriptionOnly=(item:CriteriaItem)=>item.evidenceType==="manual";
  const isAllSlotsLockedPass = (item: CriteriaItem) => {
    if (item.autoPassed) return true;
    if (isDescriptionOnly(item)) {
      return item.reviewDecision === "pass" && Boolean((item.contentText ?? "").trim());
    }
    const reqCount = Math.max(1, item.requiredCount);
    const units = item.evidenceUnits ?? [];
    if (units.length < reqCount && reqCount > 1) return false;
    let passedCount = 0;
    for (let slot = 0; slot < reqCount; slot++) {
      const u = units[slot];
      const hasFile = Boolean(u?.fileName || (slot === 0 && !units.length && item.fileName));
      if (hasFile && (u?.reviewDecision === "pass" || (slot === 0 && !units.length && item.reviewDecision === "pass") || (item.reviewDecision === "pass" && u?.reviewDecision !== "fail"))) {
        passedCount++;
      }
    }
    return passedCount >= reqCount;
  };
  const isLockedPass = (item: CriteriaItem) => isAllSlotsLockedPass(item);
  const isCriteriaDisabled = (item: CriteriaItem) => !canEdit || isAllSlotsLockedPass(item) || evidenceNotNeeded(item);
  const isCriterionSatisfiedForDisplay = (item: CriteriaItem) => {
    if (item.autoPassed) return true;
    if (isDescriptionOnly(item)) {
      const currentNote = (noteStates[item.code] ?? item.contentText ?? "").trim();
      if (!currentNote) return false;
      if (item.reviewDecision === "fail" && currentNote === (item.contentText ?? "").trim()) return false;
      return true;
    }
    const reqCount = Math.max(1, item.requiredCount);
    let satisfiedCount = 0;
    for (let slot = 0; slot < reqCount; slot++) {
      const unit = item.evidenceUnits?.[slot];
      const fieldKey = `${item.code}_${slot}`;
      const hasNewValidFile = Boolean(fileStates[fieldKey]?.name && !fileStates[fieldKey]?.error);
      const existingFile = unit?.fileName ?? (slot === 0 && !item.evidenceUnits?.length ? item.fileName : null);
      const isUnitFailed = unit?.reviewDecision === "fail" || (!item.evidenceUnits?.length && item.reviewDecision === "fail");
      const newNote = noteStates[fieldKey];
      const origNote = (unit?.note ?? (slot === 0 && !item.evidenceUnits?.length ? item.contentText : "") ?? "").trim();
      const hasEditedNote = newNote !== undefined && newNote.trim() !== origNote;
      if (hasNewValidFile || (Boolean(existingFile) && (!isUnitFailed || hasEditedNote))) {
        satisfiedCount++;
      }
    }
    return satisfiedCount >= reqCount;
  };
  const focusAndFlashCriterion = (code: string) => {
    const groupedEntries = Object.entries(
      criteria.reduce<Record<string, CriteriaItem[]>>((acc, item) => {
        const key = `${item.groupCode}. ${item.groupTitle}`;
        acc[key] = acc[key] ?? [];
        acc[key].push(item);
        return acc;
      }, {})
    );
    const token = Date.now();
    const groupIndex = groupedEntries.findIndex(([, list]) => list.some(c => c.code === code));
    if (groupIndex >= 0) {
      const targetGroupPage = Math.floor(groupIndex / 3) + 1;
      setExternalGroupPage({ page: targetGroupPage, token });
      const [, groupList] = groupedEntries[groupIndex];
      const itemIndex = groupList.findIndex(c => c.code === code);
      if (itemIndex >= 0 && groupList[0]) {
        const targetItemPage = Math.floor(itemIndex / 5) + 1;
        setExternalItemPages(prev => ({ ...prev, [groupList[0].groupCode]: { page: targetItemPage, token } }));
      }
    }
    setFlashingTarget(code);
    setTimeout(() => {
      const element = document.getElementById(`criterion-${code}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = element?.querySelector<HTMLElement>(
        '[data-failed-slot="true"] textarea:not(:disabled), [data-failed-slot="true"] input:not(:disabled), textarea:not(:disabled), input:not(:disabled)'
      );
      focusable?.focus({ preventScroll: true });
    }, 120);
    setTimeout(() => {
      setFlashingTarget(current => (current === code ? null : current));
    }, 4500);
  };

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
      toast.error(error, { id: `evidence-file-${fieldKey}` });
      return;
    }

    setDeletedSlotKeys((prev) => {
      const next = new Set(prev);
      next.delete(fieldKey);
      return next;
    });
    setFileStates((current) => ({ ...current, [fieldKey]: { name: file.name, error: "" } }));
    toast.success(`Tệp “${file.name}” hợp lệ và sẵn sàng tải lên.`, { id: `evidence-file-${fieldKey}` });
  }

  async function handleDeleteFile(fieldKey: string, existingFileId?: number | null) {
    if (fileStates[fieldKey]?.name) {
      const input = document.querySelector<HTMLInputElement>(`input[name="file_${fieldKey}"]`);
      if (input) input.value = "";
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

  async function saveAction(_prev: State, formData: FormData): Promise<State> {
    const totalFileSize=[...formData.values()].reduce((total,value)=>total+(value instanceof File?value.size:0),0);
    if(totalFileSize>maxRequestFileSize)return {ok:false,message:"Tổng dung lượng các tệp trong một lần lưu không được vượt quá 45 MB. Vui lòng lưu thành nhiều lần."};
    const missingSlotKeys: string[] = [];
    for (const item of criteria) {
      if (isLockedPass(item) || isDescriptionOnly(item) || evidenceNotNeeded(item)) continue;
      const reqCount = Math.max(1, item.requiredCount);
      for (let slot = 0; slot < reqCount; slot++) {
        const unit = item.evidenceUnits?.[slot];
        if (unit?.reviewDecision === "pass") continue;
        const fieldKey = `${item.code}_${slot}`;
        const note = String(formData.get(`note_${fieldKey}`) ?? "").trim();
        const file = formData.get(`file_${fieldKey}`);
        const hasExistingFile = Boolean(unit?.fileName || (slot === 0 && !item.evidenceUnits?.length && item.fileName));
        if (Boolean(note) && !hasExistingFile && !(file instanceof File && file.size > 0)) {
          missingSlotKeys.push(fieldKey);
        }
      }
    }
    if(missingSlotKeys.length){
      setFileStates(current=>({...current,...Object.fromEntries(missingSlotKeys.map(key=>[key,{name:current[key]?.name??"",error:"Vui lòng tải tệp minh chứng trước khi lưu mô tả."}]))}));
      return {ok:false,message:"Vui lòng tải tệp minh chứng cho các dòng đã nhập mô tả."};
    }
    try {
      const result = await saveStudentSubmissionEvidence(submissionId, formData);
      if (!result.ok) {
        return {
          ok: false,
          message: getUserFacingActionError(new Error(result.message), "Không thể lưu minh chứng."),
        };
      }
      setFileStates({});
      setNoteStates({});
      setMissingEvidence([]);
      setGroupErrors({});
      router.refresh();
      return { ok: true, message: result.message };
    } catch (error) {
      return {
        ok: false,
        message: getUserFacingActionError(error, "Không thể lưu minh chứng."),
      };
    }
  }

  async function submitAction(): Promise<State> {
    const unsavedFiles = document.querySelectorAll<HTMLInputElement>('#student-evidence-form input[type="file"]');
    const hasUnsavedFile = Array.from(unsavedFiles).some(input => (input.files?.length ?? 0) > 0);
    if (hasUnsavedFile) {
      const msg = "Bạn đã chọn tệp minh chứng mới nhưng chưa nhấn “Lưu minh chứng”. Vui lòng lưu minh chứng trước khi hoàn tất hồ sơ.";
      toast.error(msg, { id: `submit-unsaved-${submissionId}` });
      return { ok: false, message: msg };
    }

    const failedCriteria = criteria.filter(
      item =>
        item.reviewDecision === "fail" ||
        (item.evidenceUnits?.some(u => u.reviewDecision === "fail") ?? false)
    );
    if (failedCriteria.length > 0) {
      const failedCodes = failedCriteria.map(item => item.code);
      setMissingEvidence(failedCodes);
      const msg = `Bạn cần cập nhật và nhấn “Lưu minh chứng” cho các minh chứng chưa đạt (${failedCodes.join(", ")}) trước khi hoàn tất hồ sơ.`;
      toast.error(msg, { id: `submit-failed-${submissionId}` });
      focusAndFlashCriterion(failedCodes[0]);
      return { ok: false, message: msg };
    }

    try {
      const result = await submitStudentSubmission(submissionId);
      if (!result.ok && "missingCriteria" in result) {
        const missing = (result.missingCriteria ?? []).map(item => item.code);
        const deficientGroups = result.deficientGroups ?? [];
        setMissingEvidence(missing);
        setGroupErrors(Object.fromEntries(deficientGroups.map(group => [group.code, `Cần đạt tối thiểu ${group.required} tiêu chí trong tiêu chuẩn này; hiện mới đáp ứng ${group.achieved} tiêu chí.`])));
        const first = missing[0] || criteria.find(item => deficientGroups.some(group => group.code === item.groupCode) && !isCriterionSatisfiedForDisplay(item))?.code;
        if (first) focusAndFlashCriterion(first);
        const errorMessage = missing.length > 0
          ? `Vui lòng bổ sung và lưu đầy đủ minh chứng cho tiêu chí (${missing.join(", ")}) trước khi hoàn tất hồ sơ.`
          : (result.message || "Vui lòng bổ sung và lưu đủ số lượng tiêu chí theo yêu cầu trước khi hoàn tất hồ sơ.");
        toast.error(errorMessage, { id: `submit-missing-${submissionId}` });
        return { ok: false, message: errorMessage };
      }
      setMissingEvidence([]);
      setGroupErrors({});
      router.refresh();
      return { ok: true, message: result.message };
    } catch (error) {
      const errMsg = getUserFacingActionError(error, "Gửi hồ sơ thất bại.");
      toast.error(errMsg, { id: `submit-err-${submissionId}` });
      return {
        ok: false,
        message: errMsg,
      };
    }
  }
  async function supportAction(
    _prev: State,
    formData: FormData
  ): Promise<State> {
    const note = String(formData.get("supportNote") ?? "").trim();
    if (!note) {
      const msg = "Vui lòng nhập nội dung cần hỗ trợ.";
      setSupportError(msg);
      supportNoteRef.current?.focus();
      toast.error(msg, { id: `support-err-${submissionId}` });
      return { ok: false, message: msg };
    }
    if (note.length < 10) {
      const msg = "Nội dung cần hỗ trợ phải có ít nhất 10 ký tự.";
      setSupportError(msg);
      supportNoteRef.current?.focus();
      toast.error(msg, { id: `support-err-${submissionId}` });
      return { ok: false, message: msg };
    }
    setSupportError("");
    try {
      const result = await requestSubmissionSupport(submissionId, formData);
      if (!result.ok) {
        const errMsg = getUserFacingActionError(new Error(result.message), "Không thể gửi yêu cầu hỗ trợ.");
        setSupportError(errMsg);
        toast.error(errMsg, { id: `support-err-${submissionId}` });
        return { ok: false, message: errMsg };
      }
      toast.success(result.message, { id: `submission-support-${submissionId}` });
      setSupportNoteValue("");
      if (supportNoteRef.current) {
        supportNoteRef.current.value = "";
      }
      router.refresh();
      return { ok: true, message: "" };
    } catch (error) {
      const msg = getUserFacingActionError(error, "Không thể gửi yêu cầu hỗ trợ.");
      setSupportError(msg);
      return {
        ok: false,
        message: msg,
      };
    }
  }

  const [saveState, saveFormAction, saving] = useActionState(
    saveAction,
    initialState
  );
  const [submitState, submitFormAction, submitting] = useActionState(
    submitAction,
    initialState
  );
  const [supportState,supportFormAction,supporting]=useActionState(supportAction,initialState);

  const grouped = criteria.reduce<Record<string, CriteriaItem[]>>((acc, item) => {
    const key = `${item.groupCode}. ${item.groupTitle}`;
    acc[key] = acc[key] ?? [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <section className="rounded-3xl bg-white p-6 shadow-md ring-1 ring-slate-100 shadow-slate-200/60">
      <ActionFeedback pending={saving} message={saveState.message} ok={saveState.ok} />
      <ActionFeedback pending={submitting} message={submitState.message} ok={submitState.ok} />
      <ActionFeedback pending={supporting} message={supportState.message} ok={supportState.ok} />
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Minh chứng hồ sơ
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewHref ? <Link href={viewHref} className="inline-flex items-center rounded-xl border border-blue-700 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">Xem hồ sơ</Link> : null}
          {canEdit ? <button type="submit" form="student-evidence-form" disabled={saving} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">{saving ? "Đang lưu..." : "Lưu minh chứng"}</button> : null}
          {!canEdit && <span className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-500">Không thể chỉnh sửa</span>}
        </div>
      </div>

      <form id="student-evidence-form" action={saveFormAction} className="mt-4 space-y-3">
        <CriteriaGroupsPagination totalGroups={Object.keys(grouped).length} preserveChildren externalPage={externalGroupPage} className="space-y-3">{Object.entries(grouped).map(([groupTitle, items]) => {
          const groupCode = items[0]?.groupCode ?? "";
          const groupRequired = Math.max(items[0]?.minRequired ?? 0, items.filter(item => item.isRequired).length);
          const groupSubmitted = items.filter(isCriterionSatisfiedForDisplay).length;
          const groupApproved = items.filter(isAllSlotsLockedPass).length;
          return (
            <div
              key={groupTitle}
              className="overflow-hidden rounded-none border border-slate-200"
            >            
           {groupErrors[groupCode] && <p role="alert" className="bg-red-50 px-5 py-3 text-sm font-medium text-red-700">{groupErrors[groupCode]}</p>}
           <div className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-blue-700 bg-blue-50 px-5 py-3.5">
              <span className="text-base font-semibold text-blue-950">{groupTitle}</span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-sm font-semibold text-blue-900">Yêu cầu: Đạt tối thiểu {groupRequired}/{items.length} tiêu chí</span>
                <span className="text-sm font-bold text-blue-700">Đã nộp {groupSubmitted}/{items.length} tiêu chí</span>
                {groupApproved > 0 ? <span className="text-sm font-bold text-emerald-700">Đã đạt {groupApproved}/{items.length} tiêu chí</span> : null}
              </div>
            </div>

            <div className="divide-y divide-slate-100">
                <CriteriaItemPager items={items} externalPage={externalItemPages[groupCode] ?? null}>{(item) => {
                  const reqCount = Math.max(1, item.requiredCount);
                  let uploadedCount = 0;
                  let failedUnresolvedCount = 0;
                  for (let s = 0; s < reqCount; s++) {
                    const u = item.evidenceUnits?.[s];
                    const fk = `${item.code}_${s}`;
                    const hasNewValid = Boolean(fileStates[fk]?.name && !fileStates[fk]?.error);
                    const existFile = u?.fileName ?? (s === 0 && !item.evidenceUnits?.length ? item.fileName : null);
                    const unitFail = u?.reviewDecision === "fail" || (!item.evidenceUnits?.length && item.reviewDecision === "fail");
                    const nState = noteStates[fk];
                    const origN = (u?.note ?? (s === 0 && !item.evidenceUnits?.length ? item.contentText : "") ?? "").trim();
                    const noteEdited = nState !== undefined && nState.trim() !== origN;
                    if (hasNewValid || existFile) uploadedCount++;
                    if (unitFail && !hasNewValid && !noteEdited) failedUnresolvedCount++;
                  }
                  const currentManualNote = (noteStates[item.code] ?? item.contentText ?? "").trim();
                  const isManualEdited = noteStates[item.code] !== undefined && currentManualNote !== (item.contentText ?? "").trim();
                  const isManualFailedUnresolved = isDescriptionOnly(item) && item.reviewDecision === "fail" && !isManualEdited;
                  const isManualSatisfied = isDescriptionOnly(item) && Boolean(currentManualNote) && !isManualFailedUnresolved;
                  const isFlashing = flashingTarget === item.code;
                  const isItemFailed = isDescriptionOnly(item) ? isManualFailedUnresolved : failedUnresolvedCount > 0;
                  const isItemMissingUnresolved = missingEvidence.includes(item.code) && !isCriterionSatisfiedForDisplay(item);
                  return (
                <div
                  key={item.code}
                  id={`criterion-${item.code}`}
                  className={`scroll-mt-24 p-5 transition-all duration-300 ${
                    isFlashing
                      ? "bg-red-50/25"
                      : isItemFailed || isItemMissingUnresolved
                        ? "bg-red-50/10"
                        : ""
                  }`}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1">
                      <div className="font-semibold text-sm">
                        {item.code}. {item.title}<RequiredMark required={item.isRequired && !item.autoPassed} />
                      </div>
                      <div className="text-sm text-slate-500 mt-1">
                        <ExpandableText text={item.description || "Chưa có mô tả"} maxChars={160} />
                      </div>
                      {!item.autoPassed && item.autoMessage ? (
                        <AutoCriteriaMessage message={item.autoMessage} />
                      ) : null}
                    </div>

                    {item.autoPassed ? (
                      <AutoCriteriaBadge />
                    ) : item.reviewDecision === "pass" ? (
                      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">Đã đạt</span>
                    ) : isItemFailed ? (
                      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">Chưa đạt</span>
                    ) : evidenceNotNeeded(item) ? (
                      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">Không cần bổ sung</span>
                    ) : isDescriptionOnly(item) ? (
                      isManualSatisfied ? (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          Đã nhập mô tả
                        </span>
                      ) : (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                          Cần nhập mô tả
                        </span>
                      )
                    ) : uploadedCount >= reqCount ? (
                      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        {reqCount > 1 ? `Đã nộp đủ ${uploadedCount}/${reqCount} minh chứng` : "Đã nộp minh chứng"}
                      </span>
                    ) : uploadedCount > 0 ? (
                      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                        Đã nộp {uploadedCount}/{reqCount} minh chứng
                      </span>
                    ) : (
                      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                        {reqCount > 1 ? `Cần ${reqCount} minh chứng` : "Cần minh chứng"}
                      </span>
                    )}
                  </div>

                  {/* AUTO */}
                  {item.autoPassed ? (
                    <AutoCriteriaMessage message={item.autoMessage} />
                  ) : isDescriptionOnly(item) ? (
                    <div className="mt-4">
                      <input type="hidden" name="criteriaCode" value={item.code} />

                      <textarea
                        name={`note_${item.code}`}
                        defaultValue={item.contentText ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNoteStates((prev) => ({ ...prev, [item.code]: val }));
                          if (val.trim()) {
                            setMissingEvidence((prev) => prev.filter((c) => c !== item.code));
                          }
                        }}
                        placeholder="Nhập nội dung mô tả..."
                        disabled={isCriteriaDisabled(item)}
                        readOnly={item.reviewDecision === "pass"}
                        rows={2}
                        className={`h-20 min-h-20 max-h-20 w-full resize-y overflow-y-auto rounded-none border px-3 py-2 text-sm outline-none transition-colors duration-200 focus:border-blue-500 disabled:bg-slate-50 ${
                          isManualFailedUnresolved || (missingEvidence.includes(item.code) && !currentManualNote)
                            ? `bg-red-50/30 ${isFlashing ? "border-red-600" : "border-red-500"}`
                            : isManualSatisfied
                              ? "border-emerald-500 bg-emerald-50/20"
                              : "border-slate-200"
                        }`}
                      />
                      {(isManualFailedUnresolved || (missingEvidence.includes(item.code) && !currentManualNote)) && (
                        <p id={`evidence-error-${item.code}`} role="alert" className="mt-2 text-xs font-semibold text-red-700">
                          {isManualFailedUnresolved
                            ? "Mô tả tiêu chí này được đánh giá Chưa đạt. Vui lòng chỉnh sửa và nhấn “Lưu minh chứng” trước khi hoàn tất hồ sơ."
                            : "Vui lòng nhập và lưu nội dung mô tả bắt buộc trước khi hoàn tất hồ sơ."}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <input type="hidden" name="criteriaCode" value={item.code} />
                      {Array.from({ length: reqCount }).map((_, slot) => {
                        const unit = item.evidenceUnits?.[slot];
                        const fieldKey = `${item.code}_${slot}`;
                        const unitFileId = unit?.fileId ?? (slot === 0 && !item.evidenceUnits?.length ? item.fileId : null);
                        const rawFileName = unit?.fileName ?? (slot === 0 && !item.evidenceUnits?.length ? item.fileName : null);
                        const isDeleted = deletedSlotKeys.has(fieldKey);
                        const existingFileName = isDeleted ? null : rawFileName;
                        const existingFileId = isDeleted ? null : unitFileId;
                        const existingNote = unit?.note ?? (slot === 0 && !item.evidenceUnits?.length ? item.contentText : "");
                        const hasExistingFile = Boolean(existingFileName);
                        const isSlotLockedPass = hasExistingFile && (unit?.reviewDecision === "pass" || (slot === 0 && !item.evidenceUnits?.length && item.reviewDecision === "pass") || (item.reviewDecision === "pass" && unit?.reviewDecision !== "fail"));
                        const hasValidNewFile = Boolean(fileStates[fieldKey]?.name && !fileStates[fieldKey]?.error);
                        const hasAnyFile = hasValidNewFile || hasExistingFile;
                        const displayedFileName = fileStates[fieldKey]?.name || existingFileName;
                        const currentSlotNote = noteStates[fieldKey] ?? existingNote ?? "";
                        const isSlotNoteEdited = noteStates[fieldKey] !== undefined && currentSlotNote.trim() !== (existingNote ?? "").trim();
                        const isSlotFailedRaw = !isSlotLockedPass && hasExistingFile && (unit?.reviewDecision === "fail" || (!item.evidenceUnits?.length && item.reviewDecision === "fail"));
                        const isSlotFailed = isSlotFailedRaw && !hasValidNewFile && !isSlotNoteEdited;
                        const isSlotMissing = !isSlotLockedPass && (!hasExistingFile || isSlotFailed) && (missingEvidence.includes(item.code) || !isCriterionSatisfiedForDisplay(item));
                        const isSlotHighlighted = isSlotFailed || (missingEvidence.includes(item.code) && isSlotMissing) || Boolean(fileStates[fieldKey]?.error);
                        const isSlotSatisfied = !isSlotHighlighted && (isSlotLockedPass || hasValidNewFile || (hasExistingFile && !isSlotFailed));
                        const isSlotDisabled = !canEdit || isSlotLockedPass || evidenceNotNeeded(item);
                        return (
                          <div
                            key={fieldKey}
                            data-failed-slot={isSlotHighlighted ? "true" : undefined}
                            className="space-y-1.5 transition-all duration-300"
                          >
                            {reqCount > 1 || isSlotLockedPass || isSlotFailed ? (
                              <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                                <span>{reqCount > 1 ? `Minh chứng ${slot + 1}/${reqCount}` : "Minh chứng"}</span>
                                {isSlotLockedPass ? (
                                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-200">Đã đạt</span>
                                ) : isSlotFailed ? (
                                  <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 font-semibold text-rose-700 ring-1 ring-rose-200">Chưa đạt - Cần cập nhật lại</span>
                                ) : null}
                              </div>
                            ) : null}
                            <input type="hidden" name={`unitId_${fieldKey}`} value={unit?.id ? String(unit.id) : ""} />
                            <div className="grid gap-3 lg:grid-cols-10">
                              <textarea
                                name={`note_${fieldKey}`}
                                defaultValue={existingNote ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setNoteStates((prev) => ({ ...prev, [fieldKey]: val }));
                                }}
                                placeholder={reqCount > 1 ? `Nhập mô tả minh chứng ${slot + 1}...` : "Nhập mô tả minh chứng..."}
                                disabled={isSlotDisabled}
                                readOnly={isSlotLockedPass}
                                rows={2}
                                className={`h-20 min-h-20 max-h-20 w-full resize-y overflow-y-auto rounded-none border px-3 py-2 text-sm outline-none transition-colors duration-200 focus:border-blue-500 disabled:bg-slate-50 lg:col-span-5 ${
                                  isSlotHighlighted
                                    ? `bg-white ${isFlashing ? "border-red-600" : "border-red-500"}`
                                    : isSlotSatisfied || Boolean(currentSlotNote.trim())
                                      ? "border-emerald-500 bg-white"
                                      : "border-slate-200"
                                }`}
                              />

                              <div
                                className={`rounded-none border p-3 transition-colors duration-200 lg:col-span-5 ${
                                  fileStates[fieldKey]?.error || isSlotHighlighted
                                    ? `bg-red-50/40 ${isFlashing ? "border-red-600" : "border-red-500"}`
                                    : isSlotSatisfied
                                      ? "border-emerald-500 bg-emerald-50/40"
                                      : "border-slate-200 bg-slate-50"
                                }`}
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <label
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                                      !isSlotDisabled
                                        ? isSlotHighlighted
                                          ? "bg-red-600 text-white cursor-pointer hover:bg-red-700"
                                          : isSlotSatisfied
                                            ? "bg-emerald-600 text-white cursor-pointer hover:bg-emerald-700"
                                            : "bg-blue-700 text-white cursor-pointer hover:bg-blue-800"
                                        : "bg-slate-200 text-slate-400 cursor-not-allowed"
                                    }`}
                                  >
                                    <Upload size={14} />
                                    {hasAnyFile ? "Thay thế tệp" : isSlotFailedRaw ? "Tải lại tệp" : "Tải tệp"}
                                    <input
                                      type="file"
                                      name={`file_${fieldKey}`}
                                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                                      className="hidden"
                                      disabled={isSlotDisabled}
                                      aria-invalid={isSlotHighlighted}
                                      aria-describedby={missingEvidence.includes(item.code) ? `evidence-error-${item.code}` : undefined}
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
                                      <span className={`truncate ${isSlotSatisfied ? "font-medium text-emerald-800" : ""}`}>
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
                                  <p className="mt-2 text-xs font-medium text-red-700">
                                    {fileStates[fieldKey].error}
                                  </p>
                                ) : isSlotFailed && !hasValidNewFile ? (
                                  <p className="mt-2 text-xs font-semibold text-red-700">
                                    Minh chứng này được đánh giá Chưa đạt. Vui lòng tải tệp mới hoặc chỉnh sửa rồi nhấn “Lưu minh chứng”.
                                  </p>
                                ) : hasValidNewFile ? (
                                  <p className="mt-2 text-xs font-medium text-emerald-700">
                                    Tệp hợp lệ và sẵn sàng lưu.
                                  </p>
                                ) : (
                                  <p className="mt-2 text-xs text-slate-500">
                                    Chỉ nhận PDF, PNG, JPG hoặc JPEG ≤ 10 MB.
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {isItemMissingUnresolved && (
                        <p id={`evidence-error-${item.code}`} role="alert" className="text-xs font-semibold text-red-700">
                          {isItemFailed
                            ? "Vui lòng cập nhật lại minh chứng Chưa đạt (khung viền đỏ) và nhấn “Lưu minh chứng” trước khi hoàn tất hồ sơ."
                            : reqCount > 1
                              ? `Vui lòng tải và lưu đủ ${reqCount} tệp minh chứng cho tiêu chí này trước khi hoàn tất hồ sơ.`
                              : "Vui lòng tải và lưu tệp minh chứng bắt buộc trước khi hoàn tất hồ sơ."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );}}</CriteriaItemPager>
            </div>
          </div>
          );
        })}</CriteriaGroupsPagination>

      </form>

      <div className="mt-3 grid gap-3 rounded-none border border-amber-200 bg-amber-50/60 p-4 lg:grid-cols-[1fr_auto] shadow-md shadow-slate-200/60">
      <form action={supportFormAction} noValidate className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
        <label className="w-full min-w-0 flex-1">
          <span className="mb-2 block text-sm font-medium text-slate-600">Nội dung cần hỗ trợ</span>
          <textarea
            ref={supportNoteRef}
            name="supportNote"
            onChange={(e) => {
              const val = e.target.value;
              setSupportNoteValue(val);
              if (supportError && val.trim().length >= 10) setSupportError("");
            }}
            placeholder="Mô tả tiêu chí hoặc minh chứng bạn cần khoa hỗ trợ..."
            className={`min-h-20 w-full flex-1 rounded-xl border bg-white px-3 py-2 text-sm outline-none transition ${
              supportError
                ? "border-red-500 focus:border-red-500"
                : supportNoteValue.trim().length >= 10
                  ? "border-emerald-500 focus:border-emerald-500"
                  : "border-amber-200 focus:border-amber-500"
            }`}
          />
          {supportError ? (
            <span role="alert" className="mt-1.5 block text-xs font-semibold text-red-600">
              {supportError}
            </span>
          ) : null}
        </label>
        <button disabled={!canEdit || supporting} className="shrink-0 self-end rounded-xl border border-amber-500 bg-white px-4 py-2.5 text-sm font-semibold text-amber-800 disabled:opacity-60">
          {supporting ? "Đang gửi..." : "Cần hỗ trợ"}
        </button>
      </form>
      <form action={submitFormAction} className="flex items-end justify-end">
        <button
          disabled={!canEdit || submitting}
          className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Đang gửi..." : "Hoàn tất hồ sơ"}
        </button>
      </form>
      </div>

    </section>
  );
}
