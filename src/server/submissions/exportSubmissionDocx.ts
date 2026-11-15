import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement, type Node as XmlNode } from "@xmldom/xmldom";
import { getStorageProvider } from "@/server/storage/storageFactory";
import type { StorageKind } from "@/server/storage/types";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public",
  "templates",
  "1. Mẫu báo cáo thành tích SV5T cấp trường 2026.docx",
);

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const IMG_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

const SINGLE_MAX_W_EMU = 5_800_000;
const SINGLE_MAX_H_EMU = 6_400_000;
const GRID_MAX_W_EMU = 2_820_000;
const GRID_MAX_H_EMU = 3_800_000;

export type ExportSubmissionStudent = {
  fullName: string;
  mssv: string;
  studentYear: string;
  classAndFaculty: string;
  unionPosition: string;
  phone: string;
  email: string;
};

export type ExportEvidenceFile = {
  id: number;
  fileName: string;
  mimeType: string;
  objectKey: string;
  storageProvider: StorageKind;
  unitId: number | null;
};

export type ExportEvidenceUnit = {
  id: number;
  note: string | null;
};

export type ExportCriterionItem = {
  code: string;
  title: string;
  description: string | null;
  groupCode: string;
  groupTitle: string;
  contentText: string | null;
  autoMessage: string | null;
  units: ExportEvidenceUnit[];
  files: ExportEvidenceFile[];
};

type PreparedImage = {
  buffer: Buffer;
  ext: "png" | "jpg";
  widthPx: number;
  heightPx: number;
  caption: string;
};

type TemplateSlot = {
  anchorParagraph: XmlElement;
  groupIndex: number;
  searchText: string;
  normText: string;
  tokens: Set<string>;
};

const STOP_WORDS = new Set([
  "minh", "chung", "yeu", "cau", "giay", "xac", "nhan", "hoac", "bang", "khen",
  "hinh", "anh", "chup", "ban", "scan", "tieu", "chuan", "bat", "buoc", "khac",
  "dat", "tu", "tro", "len", "cap", "cua", "cho", "voi", "trong", "nam", "hoc",
  "cac", "nhung", "sau", "it", "nhat", "neu", "co", "va", "la", "duoc", "ve",
]);

function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(input: string): Set<string> {
  const words = normalizeText(input).split(/\s+/).filter(Boolean);
  return new Set(words.filter((w) => w.length >= 2 && !STOP_WORDS.has(w)));
}

function getParagraphText(p: XmlElement): string {
  const ts = p.getElementsByTagName("w:t");
  let out = "";
  for (let i = 0; i < ts.length; i++) {
    out += ts[i].textContent || "";
  }
  return out;
}

function replaceParagraphTextPreservingStyle(doc: XmlDocument, p: XmlElement, newText: string) {
  const runs: XmlElement[] = [];
  for (let i = 0; i < p.childNodes.length; i++) {
    const child = p.childNodes[i];
    if (child.nodeType === 1 && (child as unknown as XmlElement).tagName === "w:r") {
      runs.push(child as unknown as XmlElement);
    }
  }

  let templateRPr: XmlElement | null = null;
  if (runs.length > 0) {
    const rPrList = runs[0].getElementsByTagName("w:rPr");
    if (rPrList.length > 0) {
      templateRPr = rPrList[0].cloneNode(true) as XmlElement;
    }
  } else {
    const pPrList = p.getElementsByTagName("w:pPr");
    if (pPrList.length > 0) {
      const rPrList = pPrList[0].getElementsByTagName("w:rPr");
      if (rPrList.length > 0) {
        templateRPr = rPrList[0].cloneNode(true) as XmlElement;
      }
    }
  }

  for (const r of runs) {
    p.removeChild(r);
  }

  const newRun = doc.createElementNS(W_NS, "w:r");
  if (templateRPr) {
    newRun.appendChild(templateRPr);
  }
  const newT = doc.createElementNS(W_NS, "w:t");
  newT.setAttribute("xml:space", "preserve");
  newT.appendChild(doc.createTextNode(newText));
  newRun.appendChild(newT);
  p.appendChild(newRun);
}

function parsePngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function parseJpegDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xff) {
      offset++;
      continue;
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    const len = buf.readUInt16BE(offset + 2);
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc &&
      offset + 9 < buf.length
    ) {
      return {
        height: buf.readUInt16BE(offset + 5),
        width: buf.readUInt16BE(offset + 7),
      };
    }
    if (len < 2) break;
    offset += 2 + len;
  }
  return null;
}

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(stream)) return stream;
  if (stream instanceof Uint8Array) return Buffer.from(stream);

  const maybeWeb = stream as { getReader?: () => ReadableStreamDefaultReader<Uint8Array> };
  if (typeof maybeWeb?.getReader === "function") {
    const reader = maybeWeb.getReader();
    const chunks: Buffer[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function convertFileToImages(file: ExportEvidenceFile, rawBuffer: Buffer): Promise<PreparedImage[]> {
  const lowerName = file.fileName.toLowerCase();
  const lowerMime = file.mimeType.toLowerCase();

  if (lowerMime === "application/pdf" || lowerName.endsWith(".pdf")) {
    const m = await import("mupdf");
    const mupdf = m.default || m;
    const pdfDoc = mupdf.Document.openDocument(rawBuffer, "application/pdf");
    const pageCount = pdfDoc.countPages();
    const out: PreparedImage[] = [];
    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.loadPage(i);
      const pix = page.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false, true);
      const pngBytes = Buffer.from(pix.asPNG());
      const dims = parsePngDimensions(pngBytes) ?? { width: pix.getWidth(), height: pix.getHeight() };
      out.push({
        buffer: pngBytes,
        ext: "png",
        widthPx: Math.max(1, dims.width),
        heightPx: Math.max(1, dims.height),
        caption: pageCount > 1 ? `${file.fileName} (Trang ${i + 1}/${pageCount})` : file.fileName,
      });
    }
    return out;
  }

  const pngDims = parsePngDimensions(rawBuffer);
  if (pngDims) {
    return [{ buffer: rawBuffer, ext: "png", widthPx: pngDims.width, heightPx: pngDims.height, caption: file.fileName }];
  }

  const jpgDims = parseJpegDimensions(rawBuffer);
  if (jpgDims) {
    return [{ buffer: rawBuffer, ext: "jpg", widthPx: jpgDims.width, heightPx: jpgDims.height, caption: file.fileName }];
  }

  // Fallback for webp/bmp/tiff/gif via mupdf rasterization
  if (lowerMime.startsWith("image/") || /\.(webp|bmp|gif|tiff?)$/.test(lowerName)) {
    try {
      const m = await import("mupdf");
      const mupdf = m.default || m;
      const imgDoc = mupdf.Document.openDocument(rawBuffer, lowerMime || "image/png");
      if (imgDoc.countPages() > 0) {
        const page = imgDoc.loadPage(0);
        const pix = page.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false, true);
        const pngBytes = Buffer.from(pix.asPNG());
        const dims = parsePngDimensions(pngBytes) ?? { width: pix.getWidth(), height: pix.getHeight() };
        return [{
          buffer: pngBytes,
          ext: "png",
          widthPx: Math.max(1, dims.width),
          heightPx: Math.max(1, dims.height),
          caption: file.fileName,
        }];
      }
    } catch {
      // Ignore unsupported binary files
    }
  }

  return [];
}

function fitEmu(widthPx: number, heightPx: number, maxW: number, maxH: number): { cx: number; cy: number } {
  const rawW = Math.max(1, widthPx) * 9525;
  const rawH = Math.max(1, heightPx) * 9525;
  const ratio = Math.min(maxW / rawW, maxH / rawH, 1.5);
  return {
    cx: Math.max(1, Math.round(rawW * ratio)),
    cy: Math.max(1, Math.round(rawH * ratio)),
  };
}

function parseXmlFragment(doc: XmlDocument, xmlString: string): XmlElement {
  const parsed = new DOMParser().parseFromString(xmlString, "text/xml");
  if (!parsed.documentElement) {
    throw new Error("Invalid XML fragment");
  }
  return doc.importNode(parsed.documentElement, true) as unknown as XmlElement;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createTextParagraph(doc: XmlDocument, text: string, options?: { bold?: boolean; italic?: boolean; sizeHalfPt?: number; align?: "left" | "center" | "both" }): XmlElement {
  const boldXml = options?.bold ? "<w:b/><w:bCs/>" : "";
  const italicXml = options?.italic ? "<w:i/><w:iCs/>" : "";
  const sz = options?.sizeHalfPt ?? 24;
  const jc = options?.align ?? "left";
  return parseXmlFragment(
    doc,
    `<w:p xmlns:w="${W_NS}">
      <w:pPr>
        <w:spacing w:before="40" w:after="60" w:line="240" w:lineRule="auto"/>
        <w:ind w:left="284" w:firstLine="0"/>
        <w:jc w:val="${jc}"/>
      </w:pPr>
      <w:r>
        <w:rPr>${boldXml}${italicXml}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>
        <w:t xml:space="preserve">${escapeXml(text)}</w:t>
      </w:r>
    </w:p>`,
  );
}

function createImageParagraph(
  doc: XmlDocument,
  rId: string,
  cx: number,
  cy: number,
  docPrId: number,
  imageName: string,
  caption?: string,
): XmlElement {
  const captionRun = caption
    ? `<w:r><w:br/><w:rPr><w:i/><w:iCs/><w:color w:val="475569"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${escapeXml(caption)}</w:t></w:r>`
    : "";

  return parseXmlFragment(
    doc,
    `<w:p xmlns:w="${W_NS}"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
      <w:pPr>
        <w:spacing w:before="60" w:after="100" w:line="240" w:lineRule="auto"/>
        <w:jc w:val="center"/>
      </w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="${cx}" cy="${cy}"/>
            <wp:effectExtent l="0" t="0" r="0" b="0"/>
            <wp:docPr id="${docPrId}" name="${escapeXml(imageName)}"/>
            <wp:cNvGraphicFramePr>
              <a:graphicFrameLocks noChangeAspect="1"/>
            </wp:cNvGraphicFramePr>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:nvPicPr>
                    <pic:cNvPr id="${docPrId}" name="${escapeXml(imageName)}"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="${rId}"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="${cx}" cy="${cy}"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
      ${captionRun}
    </w:p>`,
  );
}

function createImageGridTable(
  doc: XmlDocument,
  items: Array<{ rId: string; cx: number; cy: number; docPrId: number; name: string; caption?: string }>,
): XmlElement {
  const tbl = parseXmlFragment(
    doc,
    `<w:tbl xmlns:w="${W_NS}">
      <w:tblPr>
        <w:tblW w:w="9920" w:type="dxa"/>
        <w:tblLayout w:type="fixed"/>
        <w:tblBorders>
          <w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>
          <w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>
          <w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>
          <w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>
          <w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>
          <w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        </w:tblBorders>
        <w:tblCellMar>
          <w:top w:w="60" w:type="dxa"/>
          <w:left w:w="80" w:type="dxa"/>
          <w:bottom w:w="60" w:type="dxa"/>
          <w:right w:w="80" w:type="dxa"/>
        </w:tblCellMar>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="4960"/>
        <w:gridCol w:w="4960"/>
      </w:tblGrid>
    </w:tbl>`,
  );

  for (let i = 0; i < items.length; i += 2) {
    const tr = doc.createElementNS(W_NS, "w:tr");
    for (let col = 0; col < 2; col++) {
      const tc = parseXmlFragment(
        doc,
        `<w:tc xmlns:w="${W_NS}"><w:tcPr><w:tcW w:w="4960" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr></w:tc>`,
      );
      const item = items[i + col];
      if (item) {
        tc.appendChild(createImageParagraph(doc, item.rId, item.cx, item.cy, item.docPrId, item.name, item.caption));
      } else {
        tc.appendChild(parseXmlFragment(doc, `<w:p xmlns:w="${W_NS}"/>`));
      }
      tr.appendChild(tc);
    }
    tbl.appendChild(tr);
  }

  return tbl;
}

function detectGroupIndex(text: string): number {
  const norm = normalizeText(text);
  if (norm.includes("tieu chuan") && norm.includes("dao duc tot")) return 1;
  if (norm.includes("tieu chuan") && norm.includes("hoc tap tot")) return 2;
  if (norm.includes("tieu chuan") && norm.includes("the luc tot")) return 3;
  if (norm.includes("tieu chuan") && norm.includes("tinh nguyen tot")) return 4;
  if (norm.includes("tieu chuan") && norm.includes("hoi nhap tot")) return 5;
  return 0;
}

function buildTemplateSlots(paragraphs: XmlElement[]): { slots: TemplateSlot[]; footerAnchor: XmlElement | null } {
  const slots: TemplateSlot[] = [];
  let currentGroup = 0;
  let bufferText: string[] = [];
  let footerAnchor: XmlElement | null = null;

  for (const p of paragraphs) {
    const raw = getParagraphText(p).trim();
    if (!raw) continue;

    if (normalizeText(raw) === "nguoi khai") {
      footerAnchor = p;
      break;
    }

    const detectedGroup = detectGroupIndex(raw);
    if (detectedGroup > 0) {
      currentGroup = detectedGroup;
      bufferText = [];
      continue;
    }

    if (currentGroup === 0) continue;

    const norm = normalizeText(raw);
    if (norm.startsWith("2 1 ") || norm.startsWith("2 2 ") || norm.startsWith("2 3 ") || norm.includes("tieu chuan bat buoc") || norm.includes("tieu chuan khac") || norm.startsWith("dat 01 trong")) {
      bufferText = [];
      continue;
    }

    if (norm.startsWith("minh chung") || norm.startsWith("khai thanh tich")) {
      const combined = [...bufferText, raw].join(" ");
      slots.push({
        anchorParagraph: p,
        groupIndex: currentGroup,
        searchText: combined,
        normText: normalizeText(combined),
        tokens: tokenize(combined),
      });
      bufferText = [];
      continue;
    }

    // Group 5 (Hội nhập tốt) embeds "(minh chứng: ...)" or "(xem sheet ...)" directly in the criterion paragraph
    if (currentGroup === 5 && (norm.includes("minh chung") || norm.includes("chung chi tieng anh") || norm.includes("diem thi tieng anh"))) {
      slots.push({
        anchorParagraph: p,
        groupIndex: currentGroup,
        searchText: raw,
        normText: norm,
        tokens: tokenize(raw),
      });
      bufferText = [];
      continue;
    }

    bufferText.push(raw);
  }

  return { slots, footerAnchor };
}

function findBestSlot(criterion: ExportCriterionItem, slots: TemplateSlot[], usedSlots: Set<TemplateSlot>): TemplateSlot | null {
  const criterionGroup = detectGroupIndex(`tieu chuan ${criterion.groupTitle}`);
  const queryText = `${criterion.title} ${criterion.description ?? ""}`;
  const queryTokens = tokenize(queryText);
  const queryNorm = normalizeText(criterion.title);

  let bestSlot: TemplateSlot | null = null;
  let bestScore = 0;

  for (const slot of slots) {
    let score = 0;
    if (criterionGroup > 0) {
      if (slot.groupIndex !== criterionGroup) continue;
      score += 2;
    }

    if (queryNorm.length >= 12 && slot.normText.includes(queryNorm.slice(0, 32))) {
      score += 12;
    }

    let overlap = 0;
    for (const t of queryTokens) {
      if (slot.tokens.has(t)) overlap++;
    }
    score += overlap * 2;

    if (!usedSlots.has(slot)) {
      score += 0.5;
    }

    if (overlap >= 2 && score > bestScore) {
      bestScore = score;
      bestSlot = slot;
    }
  }

  if (bestSlot) usedSlots.add(bestSlot);
  return bestSlot;
}

/**
 * Dựng file Word (.docx) hồ sơ xét danh hiệu dựa trên file mẫu chuẩn SV5T 2026:
 * - Giữ nguyên styles, margins, fonts, spacing, numbering và nội dung cố định của template.
 * - Điền thông tin sinh viên từ CSDL, ánh xạ từng tiêu chí tới đúng vị trí "Minh chứng:" tương ứng.
 * - Tải minh chứng từ storage (OneDrive/local) phía server, chuyển từng trang PDF sang PNG bằng MuPDF
 *   và tự co ảnh vừa khổ trang hoặc chia lưới 2 cột khi có nhiều ảnh.
 */
export async function buildSubmissionDocx(params: {
  student: ExportSubmissionStudent;
  criteria: ExportCriterionItem[];
}): Promise<Buffer> {
  const templateBuffer = await fs.readFile(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(templateBuffer);

  const docXml = await zip.file("word/document.xml")?.async("string");
  const relsXml = await zip.file("word/_rels/document.xml.rels")?.async("string");
  const contentTypesXml = await zip.file("[Content_Types].xml")?.async("string");

  if (!docXml || !relsXml || !contentTypesXml) {
    throw new Error("Invalid Word template structure.");
  }

  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  const doc = parser.parseFromString(docXml, "text/xml");
  const relsDoc = parser.parseFromString(relsXml, "text/xml");
  const ctDoc = parser.parseFromString(contentTypesXml, "text/xml");

  const body = doc.getElementsByTagName("w:body")[0];
  if (!body) throw new Error("Missing w:body in Word template.");

  const topParagraphs: XmlElement[] = [];
  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i];
    if (node.nodeType === 1 && (node as unknown as XmlElement).tagName === "w:p") {
      topParagraphs.push(node as unknown as XmlElement);
    }
  }

  const allParagraphs: XmlElement[] = [];
  const rawParagraphs = doc.getElementsByTagName("w:p");
  for (let i = 0; i < rawParagraphs.length; i++) {
    allParagraphs.push(rawParagraphs[i]);
  }

  // 1. Điền ngày xuất file và thông tin sinh viên vào phần đầu mẫu Word
  const { student } = params;
  const vnParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const exportDay = vnParts.find((part) => part.type === "day")?.value ?? "";
  const exportMonth = vnParts.find((part) => part.type === "month")?.value ?? "";
  const exportYear = vnParts.find((part) => part.type === "year")?.value ?? "";

  for (const p of allParagraphs) {
    const raw = getParagraphText(p).trim();
    if (raw.startsWith("Thành phố Hồ Chí Minh, ngày ")) {
      replaceParagraphTextPreservingStyle(
        doc,
        p,
        `Thành phố Hồ Chí Minh, ngày ${exportDay} tháng ${exportMonth} năm ${exportYear}`,
      );
    } else if (raw.startsWith("Họ và tên:")) {
      replaceParagraphTextPreservingStyle(doc, p, `Họ và tên: ${student.fullName.toUpperCase()}`);
    } else if (raw.startsWith("MSSV:")) {
      replaceParagraphTextPreservingStyle(doc, p, `MSSV: ${student.mssv}`);
    } else if (raw.startsWith("Sinh viên năm thứ:")) {
      replaceParagraphTextPreservingStyle(doc, p, `Sinh viên năm thứ: ${student.studentYear}`);
    } else if (raw.startsWith("Lớp - Khoa:")) {
      replaceParagraphTextPreservingStyle(doc, p, `Lớp - Khoa: ${student.classAndFaculty}`);
    } else if (raw.startsWith("Chức vụ Đoàn, Hội:")) {
      replaceParagraphTextPreservingStyle(doc, p, `Chức vụ Đoàn, Hội: ${student.unionPosition}`);
    } else if (raw.startsWith("Số điện thoại:")) {
      replaceParagraphTextPreservingStyle(doc, p, `Số điện thoại: ${student.phone}`);
    } else if (raw.startsWith("Email:")) {
      replaceParagraphTextPreservingStyle(doc, p, `Email: ${student.email}`);
    }
  }

  // 2. Prepare relationship & docPr ID counters
  const relsRoot = relsDoc.documentElement;
  if (!relsRoot) throw new Error("Missing root in document.xml.rels");
  let maxRid = 0;
  const existingRels = relsDoc.getElementsByTagName("Relationship");
  for (let i = 0; i < existingRels.length; i++) {
    const idAttr = existingRels[i].getAttribute("Id") || "";
    const num = Number(idAttr.replace(/^rId/, ""));
    if (Number.isFinite(num) && num > maxRid) maxRid = num;
  }

  let nextDocPrId = 100;
  const existingDocPrs = doc.getElementsByTagName("wp:docPr");
  for (let i = 0; i < existingDocPrs.length; i++) {
    const num = Number(existingDocPrs[i].getAttribute("id") || "0");
    if (Number.isFinite(num) && num >= nextDocPrId) nextDocPrId = num + 1;
  }

  // Ensure png / jpg / jpeg defaults exist in [Content_Types].xml
  const ctRoot = ctDoc.documentElement;
  if (!ctRoot) throw new Error("Missing root in [Content_Types].xml");
  const existingExtensions = new Set<string>();
  const defaultNodes = ctDoc.getElementsByTagName("Default");
  for (let i = 0; i < defaultNodes.length; i++) {
    const ext = (defaultNodes[i].getAttribute("Extension") || "").toLowerCase();
    if (ext) existingExtensions.add(ext);
  }
  for (const [ext, contentType] of [
    ["png", "image/png"],
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
  ] as const) {
    if (!existingExtensions.has(ext)) {
      const def = ctDoc.createElementNS(CT_NS, "Default");
      def.setAttribute("Extension", ext);
      def.setAttribute("ContentType", contentType);
      ctRoot.appendChild(def);
      existingExtensions.add(ext);
    }
  }

  // 3. Map criteria to template slots and download/render evidence files from storage
  const { slots, footerAnchor: topFooterAnchor } = buildTemplateSlots(topParagraphs);
  const nguoiKhaiParagraph = allParagraphs.find((p) => getParagraphText(p).trim() === "Người khai");
  let footerBodyNode: XmlElement | null = topFooterAnchor;

  if (nguoiKhaiParagraph) {
    // Walk up to the direct child of w:body (e.g., the signature w:tbl) so body.insertBefore works safely
    let current: XmlNode | null = nguoiKhaiParagraph;
    while (current && current.parentNode && current.parentNode !== body) {
      current = current.parentNode;
    }
    if (current && current.parentNode === body && current.nodeType === 1) {
      footerBodyNode = current as XmlElement;
    }

    // Find the signer name paragraph 4 paragraphs after "Người khai" inside the same cell/parent
    const cellParent = nguoiKhaiParagraph.parentNode;
    const siblingParagraphs: XmlElement[] = [];
    if (cellParent) {
      for (let i = 0; i < cellParent.childNodes.length; i++) {
        const child = cellParent.childNodes[i];
        if (child.nodeType === 1 && (child as unknown as XmlElement).tagName === "w:p") {
          siblingParagraphs.push(child as unknown as XmlElement);
        }
      }
    }
    const nkIdx = siblingParagraphs.indexOf(nguoiKhaiParagraph);
    const signerParagraph = nkIdx >= 0 ? siblingParagraphs[nkIdx + 4] : undefined;
    if (signerParagraph) {
      replaceParagraphTextPreservingStyle(doc, signerParagraph, student.fullName);
      // Ensure bold styling on the signer name run
      const run = signerParagraph.getElementsByTagName("w:r")[0];
      if (run) {
        let rPr = run.getElementsByTagName("w:rPr")[0];
        if (!rPr) {
          rPr = doc.createElementNS(W_NS, "w:rPr");
          run.insertBefore(rPr, run.firstChild);
        }
        if (rPr.getElementsByTagName("w:b").length === 0) {
          rPr.appendChild(doc.createElementNS(W_NS, "w:b"));
          rPr.appendChild(doc.createElementNS(W_NS, "w:bCs"));
        }
      }
    }
  }

  // Remove excess empty paragraphs right before the signature block to avoid pushing it onto a blank page
  if (footerBodyNode) {
    let emptyCountBefore = 0;
    let prev: XmlNode | null = footerBodyNode.previousSibling;
    while (prev) {
      const candidate = prev;
      prev = prev.previousSibling;
      if (candidate.nodeType !== 1) continue;
      const el = candidate as XmlElement;
      if (el.tagName === "w:p" && !getParagraphText(el).trim() && el.getElementsByTagName("w:drawing").length === 0) {
        emptyCountBefore++;
        if (emptyCountBefore > 1) {
          body.removeChild(el);
        }
      } else {
        break;
      }
    }
  }
  const usedSlots = new Set<TemplateSlot>();
  let mediaCounter = 0;
  const unmatchedCriteria: ExportCriterionItem[] = [];

  const appendEvidenceNodesAfter = async (
    anchor: XmlElement,
    criterion: ExportCriterionItem,
    insertBeforeAnchor = false,
  ) => {
    const nodesToInsert: XmlElement[] = [];

    const appendMediaBlocks = async (files: ExportEvidenceFile[]) => {
      if (files.length === 0) return;
      const preparedImages: PreparedImage[] = [];
      const nonImageFiles: string[] = [];

      for (const file of files) {
        try {
          const provider = getStorageProvider(file.storageProvider);
          const { stream } = await provider.read(file.objectKey);
          const buffer = await streamToBuffer(stream);
          const imgs = await convertFileToImages(file, buffer);
          if (imgs.length > 0) {
            preparedImages.push(...imgs);
          } else {
            nonImageFiles.push(file.fileName);
          }
        } catch {
          nonImageFiles.push(`${file.fileName} (không thể tải tệp)`);
        }
      }

      if (preparedImages.length === 1) {
        const img = preparedImages[0];
        mediaCounter++;
        const mediaRelPath = `media/evidence_${mediaCounter}.${img.ext}`;
        zip.file(`word/${mediaRelPath}`, img.buffer);

        maxRid++;
        const rId = `rId${maxRid}`;
        const rel = relsDoc.createElementNS(RELS_NS, "Relationship");
        rel.setAttribute("Id", rId);
        rel.setAttribute("Type", IMG_REL_TYPE);
        rel.setAttribute("Target", mediaRelPath);
        relsRoot.appendChild(rel);

        const { cx, cy } = fitEmu(img.widthPx, img.heightPx, SINGLE_MAX_W_EMU, SINGLE_MAX_H_EMU);
        const docPrId = nextDocPrId++;
        nodesToInsert.push(createImageParagraph(doc, rId, cx, cy, docPrId, `evidence_${mediaCounter}`));
      } else if (preparedImages.length > 1) {
        const gridItems: Array<{ rId: string; cx: number; cy: number; docPrId: number; name: string }> = [];
        for (const img of preparedImages) {
          mediaCounter++;
          const mediaRelPath = `media/evidence_${mediaCounter}.${img.ext}`;
          zip.file(`word/${mediaRelPath}`, img.buffer);

          maxRid++;
          const rId = `rId${maxRid}`;
          const rel = relsDoc.createElementNS(RELS_NS, "Relationship");
          rel.setAttribute("Id", rId);
          rel.setAttribute("Type", IMG_REL_TYPE);
          rel.setAttribute("Target", mediaRelPath);
          relsRoot.appendChild(rel);

          const { cx, cy } = fitEmu(img.widthPx, img.heightPx, GRID_MAX_W_EMU, GRID_MAX_H_EMU);
          gridItems.push({
            rId,
            cx,
            cy,
            docPrId: nextDocPrId++,
            name: `evidence_${mediaCounter}`,
          });
        }
        nodesToInsert.push(createImageGridTable(doc, gridItems));
      }

      if (nonImageFiles.length > 0) {
        nodesToInsert.push(
          createTextParagraph(doc, `Tệp đính kèm khác: ${nonImageFiles.join(", ")}`, { italic: true, sizeHalfPt: 22 }),
        );
      }
    };

    const activeUnits = criterion.units.filter(
      (u) => Boolean(u.note?.trim()) || criterion.files.some((f) => f.unitId === u.id),
    );

    if (activeUnits.length > 0) {
      for (let idx = 0; idx < activeUnits.length; idx++) {
        const unit = activeUnits[idx];
        const unitNote = unit.note?.trim();
        if (unitNote) {
          const label = activeUnits.length > 1 ? `Minh chứng ${idx + 1}: ${unitNote}` : `Nội dung minh chứng: ${unitNote}`;
          nodesToInsert.push(createTextParagraph(doc, label, { sizeHalfPt: 24, align: "left" }));
        }
        const unitFiles = criterion.files.filter((f) => f.unitId === unit.id);
        await appendMediaBlocks(unitFiles);
      }
      const activeUnitIds = new Set(activeUnits.map((u) => u.id));
      const unassignedFiles = criterion.files.filter((f) => f.unitId === null || !activeUnitIds.has(f.unitId));
      await appendMediaBlocks(unassignedFiles);
    } else {
      if (criterion.contentText?.trim()) {
        nodesToInsert.push(
          createTextParagraph(doc, `Nội dung minh chứng: ${criterion.contentText.trim()}`, { sizeHalfPt: 24, align: "left" }),
        );
      }
      await appendMediaBlocks(criterion.files);
    }

    if (insertBeforeAnchor) {
      for (const node of nodesToInsert) {
        body.insertBefore(node, anchor);
      }
      return;
    }

    const cursor: XmlNode | null = anchor.nextSibling;
    for (const node of nodesToInsert) {
      if (cursor) {
        body.insertBefore(node, cursor);
      } else {
        body.appendChild(node);
      }
    }
  };

  for (const criterion of params.criteria) {
    const hasContent = Boolean(criterion.contentText?.trim()) || criterion.units.some((u) => Boolean(u.note?.trim())) || criterion.files.length > 0;
    if (!hasContent) continue;

    const slot = findBestSlot(criterion, slots, usedSlots);
    if (slot) {
      await appendEvidenceNodesAfter(slot.anchorParagraph, criterion, false);
    } else {
      unmatchedCriteria.push(criterion);
    }
  }

  // Append any unmatched criteria cleanly before "Người khai"
  if (unmatchedCriteria.length > 0) {
    const anchor = footerBodyNode ?? topParagraphs[topParagraphs.length - 1];
    const heading = createTextParagraph(doc, "PHỤ LỤC MINH CHỨNG BỔ SUNG", { bold: true, sizeHalfPt: 26 });
    if (footerBodyNode) {
      body.insertBefore(heading, anchor);
    } else {
      body.appendChild(heading);
    }

    for (const criterion of unmatchedCriteria) {
      const titleNode = createTextParagraph(doc, `- ${criterion.groupTitle}: ${criterion.title}`, { bold: true, sizeHalfPt: 24 });
      if (footerBodyNode) {
        body.insertBefore(titleNode, anchor);
        await appendEvidenceNodesAfter(anchor, criterion, true);
      } else {
        body.appendChild(titleNode);
        await appendEvidenceNodesAfter(titleNode, criterion, false);
      }
    }
  }

  // Compact any trailing empty paragraphs before w:sectPr so they don't spill onto an extra blank page
  const sectPr = body.getElementsByTagName("w:sectPr")[0];
  let tail: XmlNode | null = sectPr ? sectPr.previousSibling : body.lastChild;
  let keptTrailingEmpty = false;
  while (tail) {
    const candidate = tail;
    tail = tail.previousSibling;
    if (candidate.nodeType !== 1) continue;
    const el = candidate as XmlElement;
    if (el.tagName === "w:p" && !getParagraphText(el).trim() && el.getElementsByTagName("w:drawing").length === 0) {
      if (keptTrailingEmpty) {
        body.removeChild(el);
      } else {
        keptTrailingEmpty = true;
        // Shrink the mandatory post-table paragraph to 1pt with 0 spacing so it never forces a blank page
        let pPr = el.getElementsByTagName("w:pPr")[0];
        if (!pPr) {
          pPr = doc.createElementNS(W_NS, "w:pPr");
          el.insertBefore(pPr, el.firstChild);
        }
        const existingSpacing = pPr.getElementsByTagName("w:spacing")[0];
        if (existingSpacing) pPr.removeChild(existingSpacing);
        const spacing = doc.createElementNS(W_NS, "w:spacing");
        spacing.setAttribute("w:before", "0");
        spacing.setAttribute("w:after", "0");
        spacing.setAttribute("w:line", "20");
        spacing.setAttribute("w:lineRule", "exact");
        pPr.appendChild(spacing);

        const existingRPr = pPr.getElementsByTagName("w:rPr")[0];
        if (existingRPr) pPr.removeChild(existingRPr);
        const rPr = doc.createElementNS(W_NS, "w:rPr");
        const sz = doc.createElementNS(W_NS, "w:sz");
        sz.setAttribute("w:val", "2");
        const szCs = doc.createElementNS(W_NS, "w:szCs");
        szCs.setAttribute("w:val", "2");
        rPr.appendChild(sz);
        rPr.appendChild(szCs);
        pPr.appendChild(rPr);
      }
    } else {
      break;
    }
  }

  zip.file("word/document.xml", serializer.serializeToString(doc));
  zip.file("word/_rels/document.xml.rels", serializer.serializeToString(relsDoc));
  zip.file("[Content_Types].xml", serializer.serializeToString(ctDoc));

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
