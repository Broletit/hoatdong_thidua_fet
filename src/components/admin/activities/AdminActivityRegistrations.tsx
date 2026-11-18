import DataTable from "@/components/common/DataTable";
import { getDatabase } from "@/server/db/mysql";
import CancelRegistrationControl from "./CancelRegistrationControl";
import TableResultsFooter from "@/components/common/TableResultsFooter";
import PaginationArrow from "@/components/common/PaginationArrow";
import { formatDateTimeVN } from "@/lib/utils/formatDateTimeVN";
import AdminActivityRegistrationsFilter from "./AdminActivityRegistrationsFilter";
import FilteredListExportButton from "@/components/admin/reports/FilteredListExportButton";

type RegistrationFilters = { registrationKeyword?: string; registrationCohort?: string; registrationClassId?: string; registrationStatus?: string };

type RegistrationRow = {
  id: number;
  status: string;
  import_batch_id: number | null;
  attendance_note: string | null;
  registered_at: string | null;
  full_name: string;
  mssv: string;
  class_code: string | null;
};

function getStatusLabel(status: string) {
  if (status === "attended") return "Đã điểm danh";
  if (status === "absent") return "Vắng";
  return "Chưa xác nhận";
}

function getAttendanceMethodLabel(row: Pick<RegistrationRow, "status" | "import_batch_id" | "attendance_note">) {
  if (row.status !== "attended") return "—";
  if (row.import_batch_id != null) return "Cập nhật từ danh sách";
  if (row.attendance_note?.includes("thủ công")) return "Thủ công";
  if (row.attendance_note) return "Quét mã";
  return "—";
}

export default async function AdminActivityRegistrations({ activityId, requestedPage = "1", filters = {} }: { activityId: number; requestedPage?: string; filters?: RegistrationFilters }) {
  const db = getDatabase();
  const activity = await db.first("SELECT title, CASE WHEN end_at IS NOT NULL AND CAST(end_at AS DATETIME(3))<=CURRENT_TIMESTAMP(3) THEN 1 ELSE 0 END AS ended FROM activities WHERE id=?", [activityId]) as { title: string; ended: number } | undefined;
  const keyword = filters.registrationKeyword?.trim() ?? "";
  const cohort = Number(filters.registrationCohort) || 0;
  const classId = Number(filters.registrationClassId) || 0;
  const status = ["unconfirmed", "attended", "absent"].includes(filters.registrationStatus ?? "") ? filters.registrationStatus! : "";
  const where = ["ar.activity_id=?", "ar.status<>'cancelled'"];
  const values: Array<string | number> = [activityId];
  if (keyword) { where.push("(u.full_name LIKE ? OR u.mssv LIKE ?)"); values.push(`%${keyword}%`, `%${keyword}%`); }
  if (cohort) { where.push("u.cohort=?"); values.push(cohort); }
  if (classId) { where.push("cm.class_id=?"); values.push(classId); }
  if (status) { where.push("ar.status=?"); values.push(status); }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const classes = await db.rows("SELECT id,code,cohort FROM classes WHERE is_active=1 ORDER BY cohort,code") as Array<{ id: number; code: string; cohort: number | null }>;
  const { total } = await db.first(`SELECT COUNT(*) total FROM activity_registrations ar JOIN users u ON u.id=ar.user_id LEFT JOIN class_members cm ON cm.user_id=u.id AND cm.left_at IS NULL ${whereSql}`, values) as { total: number };
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const candidatePage = Number(requestedPage);
  const page = Math.min(totalPages, Number.isSafeInteger(candidatePage) ? Math.max(1, candidatePage) : 1);
  const allFilteredRows = await db.rows(
    `SELECT ar.id,ar.status,ar.registered_at,ar.import_batch_id,(SELECT note FROM activity_attendance_logs al WHERE al.activity_id=ar.activity_id AND al.user_id=ar.user_id AND al.result='success' ORDER BY al.id DESC LIMIT 1) attendance_note,u.full_name,u.mssv,c.code AS class_code FROM activity_registrations ar JOIN users u ON u.id=ar.user_id LEFT JOIN class_members cm ON cm.user_id=u.id AND cm.left_at IS NULL LEFT JOIN classes c ON c.id=cm.class_id ${whereSql} ORDER BY ar.registered_at DESC,ar.id DESC`,
    values,
  ) as RegistrationRow[];
  const rows = allFilteredRows.slice((page - 1) * pageSize, page * pageSize);
  const query = (nextPage: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, value]) => Boolean(value))), registrationPage: String(nextPage) }).toString()}`;
  const showActions = Boolean(activity) && !activity?.ended;

  const exportRows = allFilteredRows.map((row) => ({
    fullName: row.full_name,
    mssv: row.mssv,
    classCode: row.class_code ?? "—",
    registeredAt: formatDateTimeVN(row.registered_at),
    status: getStatusLabel(row.status),
    method: getAttendanceMethodLabel(row),
  }));

  return <section className="min-w-0 rounded-3xl bg-white p-4 shadow-md ring-1 ring-slate-100 shadow-slate-200/60 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="min-w-0 text-lg font-semibold text-slate-900">Danh sách đăng ký</h2>
      <div className="shrink-0">
        <FilteredListExportButton
          rows={exportRows}
          columns={[
            { key: "fullName", label: "Họ tên" },
            { key: "mssv", label: "MSSV" },
            { key: "classCode", label: "Lớp" },
            { key: "registeredAt", label: "Thời gian đăng ký" },
            { key: "status", label: "Trạng thái" },
            { key: "method", label: "Hình thức điểm danh" },
          ]}
          fileName={`danh-sach-dang-ky-hoat-dong-${activityId}.xlsx`}
          sheetName="Danh sách đăng ký"
          title={`DANH SÁCH ĐĂNG KÝ: ${(activity?.title ?? "HOẠT ĐỘNG").toUpperCase()}`}
        />
      </div>
    </div>
    <div className="mt-5"><AdminActivityRegistrationsFilter classes={classes} /></div>
    <div data-table-frame className="mt-5 min-w-0"><div className="overflow-x-auto rounded-none border border-slate-200"><DataTable className="activity-registrations-table"><colgroup><col style={{ width: "3.75rem" }} /><col /><col /><col style={{ width: "14rem" }} /><col /><col />{showActions ? <col /> : null}</colgroup><thead className="bg-blue-800 text-white"><tr><th className="bg-blue-800 px-4 py-3 text-center text-sm text-white">STT</th>{["Họ tên", "MSSV", "Thời gian đăng ký", "Trạng thái", "Hình thức điểm danh", ...(showActions ? ["Thao tác"] : [])].map((label) => <th key={label} className="whitespace-nowrap bg-blue-800 px-4 py-3 text-left text-sm text-white">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={row.id}><td className="px-4 py-3 text-center text-sm">{(page - 1) * pageSize + index + 1}</td><td className="px-4 py-3 text-sm">{row.full_name}</td><td className="px-4 py-3 text-sm">{row.mssv}</td><td className="whitespace-nowrap px-4 py-3 text-sm">{formatDateTimeVN(row.registered_at)}</td><td className="whitespace-nowrap px-4 py-3 text-sm">{getStatusLabel(row.status)}</td><td className="whitespace-nowrap px-4 py-3 text-sm">{getAttendanceMethodLabel(row)}</td>{showActions ? <td className="px-4 py-3">{row.status !== "attended" ? <CancelRegistrationControl registrationId={row.id} /> : null}</td> : null}</tr>)}{!rows.length ? <tr><td colSpan={showActions ? 7 : 6} className="px-4 py-8 text-center text-sm text-slate-500">Chưa có đăng ký.</td></tr> : null}</tbody></DataTable></div><TableResultsFooter totalResults={total} resultLabel="đăng ký"><PaginationArrow href={query(page - 1)} direction="left" disabled={page <= 1} /><span className="text-sm text-slate-500">Trang {page}/{totalPages}</span><PaginationArrow href={query(page + 1)} direction="right" disabled={page >= totalPages} /></TableResultsFooter></div>
  </section>;
}
