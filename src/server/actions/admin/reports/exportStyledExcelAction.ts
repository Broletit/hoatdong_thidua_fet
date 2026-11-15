"use server";

import { requireLogin } from "@/server/auth/guards";
import { buildStyledExcelBuffer, type StyledExcelColumn } from "@/lib/exports/buildStyledExcel";

/**
 * Server Action tạo file Excel (.xlsx) có định dạng chuẩn để các nút xuất ở client tải về dưới dạng base64.
 */
export async function exportStyledExcelAction(params: {
  fileName: string;
  sheetName: string;
  title: string;
  subtitle?: string;
  columns: StyledExcelColumn[];
  rows: Array<Array<string | number | null | undefined>>;
}): Promise<{ fileName: string; base64: string }> {
  await requireLogin();
  const buffer = await buildStyledExcelBuffer({
    sheetName: params.sheetName,
    title: params.title,
    subtitle: params.subtitle,
    columns: params.columns,
    rows: params.rows,
  });
  return {
    fileName: params.fileName.endsWith(".xlsx") ? params.fileName : `${params.fileName}.xlsx`,
    base64: buffer.toString("base64"),
  };
}
