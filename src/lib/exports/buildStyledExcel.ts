import ExcelJS from "exceljs";

export type StyledExcelColumn = {
  header: string;
  width?: number;
  align?: "left" | "center" | "right";
};

export type BuildStyledExcelOptions = {
  sheetName: string;
  title: string;
  subtitle?: string;
  columns: StyledExcelColumn[];
  rows: Array<Array<string | number | null | undefined>>;
};

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, " ").trim();
  return (cleaned || "Du lieu").slice(0, 31);
}

/**
 * Tạo buffer file Excel (.xlsx) có định dạng chuẩn: tiêu đề báo cáo, phụ đề,
 * header nền xanh navy chữ trắng, viền bảng, zebra striping, tự căn độ rộng cột và cố định dòng tiêu đề.
 */
export async function buildStyledExcelBuffer(options: BuildStyledExcelOptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "thiduafet";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sanitizeSheetName(options.sheetName), {
    views: [{ state: "frozen", ySplit: options.subtitle ? 4 : 3 }],
  });

  const colCount = Math.max(1, options.columns.length);
  const lastColLetter = sheet.getColumn(colCount).letter;

  // Title row
  const titleRow = sheet.addRow([options.title]);
  sheet.mergeCells(`A1:${lastColLetter}1`);
  titleRow.height = 28;
  const titleCell = titleRow.getCell(1);
  titleCell.font = { name: "Calibri", size: 15, bold: true, color: { argb: "FF1E3A8A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };

  // Subtitle row
  if (options.subtitle) {
    const subRow = sheet.addRow([options.subtitle]);
    sheet.mergeCells(`A2:${lastColLetter}2`);
    subRow.height = 20;
    const subCell = subRow.getCell(1);
    subCell.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF475569" } };
    subCell.alignment = { vertical: "middle", horizontal: "left" };
  }

  // Blank spacer row
  const spacer = sheet.addRow([]);
  spacer.height = 8;

  // Header row
  const headerRowNumber = options.subtitle ? 4 : 3;
  const headerRow = sheet.addRow(options.columns.map((c) => c.header));
  headerRow.height = 26;
  headerRow.eachCell((cell, colNumber) => {
    const colDef = options.columns[colNumber - 1];
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A8A" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: colDef?.align ?? "center",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF1E3A8A" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FF1E3A8A" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });

  // Track max text lengths for auto column width
  const maxLengths = options.columns.map((c) => Math.max(10, c.header.length + 4));

  // Data rows
  options.rows.forEach((rowValues, rowIdx) => {
    const normalized = options.columns.map((_, i) => {
      const val = rowValues[i];
      if (val === null || val === undefined) return "";
      const strLen = String(val).length;
      if (strLen + 3 > maxLengths[i]) {
        maxLengths[i] = Math.min(48, strLen + 3);
      }
      return val;
    });

    const dataRow = sheet.addRow(normalized);
    dataRow.height = 22;
    const isEven = rowIdx % 2 === 1;

    dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const colDef = options.columns[colNumber - 1];
      cell.font = { name: "Calibri", size: 11, color: { argb: "FF0F172A" } };
      if (isEven) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      }
      cell.alignment = {
        vertical: "middle",
        horizontal: colDef?.align ?? "left",
        wrapText: true,
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });

  // Auto-filter on header row
  if (options.rows.length > 0) {
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber + options.rows.length, column: colCount },
    };
  }

  // Apply column widths
  options.columns.forEach((col, idx) => {
    sheet.getColumn(idx + 1).width = col.width ?? Math.min(48, Math.max(12, maxLengths[idx]));
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
