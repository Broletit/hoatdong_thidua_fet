"use server";
import { revalidatePath } from "next/cache";
import { requireStudentContext } from "@/server/auth/guards";
import { saveEvidence } from "@/server/storage/evidenceService";
import { getUserFacingActionError } from "@/lib/errors/getUserFacingActionError";

export async function saveStudentSubmissionEvidence(submissionId: number, formData: FormData) {
  try {
    const user = await requireStudentContext();
    const submission = await saveEvidence(user, submissionId, formData, "student");
    revalidatePath(`/dashboard/student/submissions/${submissionId}`);
    revalidatePath(`/dashboard/student/events/${submission.event_id}`);
    revalidatePath("/dashboard/student/submissions");
    return { ok: true, message: "Đã lưu minh chứng." };
  } catch (error) {
    console.error("[saveStudentSubmissionEvidence]", error);
    return {
      ok: false,
      message: getUserFacingActionError(error, "Không thể lưu minh chứng. Vui lòng kiểm tra lại dữ liệu hoặc thử lại sau."),
    };
  }
}
