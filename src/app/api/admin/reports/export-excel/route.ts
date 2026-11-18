import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/getSessionUser";
import type { StyledExcelColumn } from "@/lib/exports/buildStyledExcel";

type ExportExcelBody = {
  fileName?: string;
  sheetName?: string;
  title?: string;
  subtitle?: string;
  columns?: StyledExcelColumn[];
  rows?: Array<Array<string | number | null | undefined>>;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || !user.is_active) {
      return NextResponse.json({ message: "Vui lòng đăng nhập." }, { status: 401 });
    }

    const body = (await request.json()) as ExportExcelBody;
    const columns = Array.isArray(body.columns) ? body.columns : [];
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (!columns.length) {
      return NextResponse.json({ message: "Thiếu cấu hình cột dữ liệu." }, { status: 400 });
    }

    const rawFileName = String(body.fileName || "danh-sach.xlsx").replace(/[^a-zA-Z0-9._-]/g, "-");
    const safeFileName = rawFileName.endsWith(".xlsx") ? rawFileName : `${rawFileName}.xlsx`;

    const { buildStyledExcelBuffer } = await import("@/lib/exports/buildStyledExcel");
    const buffer = await buildStyledExcelBuffer({
      sheetName: String(body.sheetName || "Danh sách"),
      title: String(body.title || "DANH SÁCH XUẤT DỮ LIỆU"),
      subtitle: body.subtitle ? String(body.subtitle) : undefined,
      columns,
      rows,
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeFileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[export-excel] error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Không thể tạo file Excel." },
      { status: 500 },
    );
  }
}
