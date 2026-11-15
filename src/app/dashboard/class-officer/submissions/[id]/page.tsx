import { notFound } from "next/navigation";
import { requireClassOfficerContext } from "@/server/auth/guards";

/**
 * Cán bộ lớp không được phép xem chi tiết/minh chứng hồ sơ sinh viên.
 */
export default async function ClassOfficerSubmissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ termId?: string }>;
}) {
  await requireClassOfficerContext();
  await Promise.all([params, searchParams]);
  notFound();
}
