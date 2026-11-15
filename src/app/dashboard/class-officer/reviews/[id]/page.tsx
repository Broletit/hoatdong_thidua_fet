import { notFound } from "next/navigation";
import { requireClassOfficerContext } from "@/server/auth/guards";

/**
 * Cán bộ lớp không được phép truy cập trang chi tiết xét duyệt hồ sơ (chỉ theo dõi danh sách tổng hợp).
 */
export default async function ClassOfficerReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ termId?: string; mode?: string }>;
}) {
  await requireClassOfficerContext();
  await Promise.all([params, searchParams]);
  notFound();
}
