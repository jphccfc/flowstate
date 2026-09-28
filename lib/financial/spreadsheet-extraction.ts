import { inflateRawSync } from "node:zlib";
import { XMLValidator } from "fast-xml-parser";

export type FinancialSpreadsheetCell = { ref: string; value: string };
export type FinancialSpreadsheetRow = { rowNumber: number; cells: FinancialSpreadsheetCell[] };
export type FinancialSpreadsheet = { format: "csv" | "xlsx"; sheets: Array<{ name: string; rows: FinancialSpreadsheetRow[] }> };

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_SHEETS = 20;
const MAX_ROWS_PER_SHEET = 10_000;
const MAX_CELLS_PER_SHEET = 100_000;

function extensionFromName(name: string): string { return name.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ""; }
function columnReference(index: number): string {
  let column = ""; let remaining = index + 1;
  while (remaining > 0) { const remainder = (remaining - 1) % 26; column = String.fromCharCode(65 + remainder) + column; remaining = Math.floor((remaining - 1) / 26); }
  return column;
}
function decodeXml(value: string): string { return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]; const next = text[index + 1];
    if (character === '"') { if (quoted && next === '"') { value += '"'; index += 1; } else quoted = !quoted; }
    else if (character === "," && !quoted) { row.push(value); value = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) { if (character === "\r" && next === "\n") index += 1; row.push(value); value = ""; if (row.some((cell) => cell.length > 0)) rows.push(row); row = []; }
    else value += character;
  }
  row.push(value); if (row.some((cell) => cell.length > 0)) rows.push(row); if (quoted) throw new Error("CSV contains an unterminated quoted value"); return rows;
}

/** Safely reads only required XLSX ZIP members with strict archive limits. */
function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error("Spreadsheet exceeds the 20 MB intake limit");
  let end = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65_557); index -= 1) if (buffer.readUInt32LE(index) === 0x06054b50) { end = index; break; }
  if (end < 0) throw new Error("XLSX archive is malformed: end-of-directory record is missing");
  const entries = buffer.readUInt16LE(end + 10); const directorySize = buffer.readUInt32LE(end + 12); let cursor = buffer.readUInt32LE(end + 16);
  if (entries > 256 || cursor + directorySize > buffer.length) throw new Error("XLSX archive directory exceeds safe limits");
  const result = new Map<string, Buffer>(); let totalUncompressed = 0;
  for (let item = 0; item < entries; item += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("XLSX archive directory is malformed");
    const method = buffer.readUInt16LE(cursor + 10); const compressedSize = buffer.readUInt32LE(cursor + 20); const uncompressedSize = buffer.readUInt32LE(cursor + 24); const nameLength = buffer.readUInt16LE(cursor + 28); const extraLength = buffer.readUInt16LE(cursor + 30); const commentLength = buffer.readUInt16LE(cursor + 32); const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"); cursor += 46 + nameLength + extraLength + commentLength;
    if (!name.startsWith("xl/") || name.includes("..") || name.length > 255) continue;
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES || uncompressedSize > MAX_UNCOMPRESSED_BYTES) throw new Error("XLSX archive exceeds safe uncompressed limits");
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("XLSX archive local entry is malformed");
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28); const compressed = buffer.subarray(start, start + compressedSize);
    if (compressed.length !== compressedSize) throw new Error("XLSX archive entry is truncated");
    if (method === 0) result.set(name, compressed); else if (method === 8) result.set(name, inflateRawSync(compressed, { maxOutputLength: MAX_UNCOMPRESSED_BYTES })); else throw new Error("XLSX uses an unsupported archive compression method");
  }
  return result;
}
function xml(entries: Map<string, Buffer>, path: string, required = true): string | null {
  const bytes = entries.get(path); if (!bytes) { if (required) throw new Error(`XLSX is missing required part: ${path}`); return null; }
  const value = bytes.toString("utf8"); if (XMLValidator.validate(value) !== true) throw new Error(`XLSX contains invalid XML: ${path}`); return value;
}
function attr(fragment: string, name: string): string | null { return fragment.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null; }
function textContent(fragment: string): string { return decodeXml([...fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("")); }

function extractXlsx(buffer: Buffer): FinancialSpreadsheet {
  const entries = readZipEntries(buffer); const workbook = xml(entries, "xl/workbook.xml")!; const relationships = xml(entries, "xl/_rels/workbook.xml.rels")!; const sharedStringsXml = xml(entries, "xl/sharedStrings.xml", false);
  const sharedStrings = sharedStringsXml ? [...sharedStringsXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((part) => textContent(part[1])) : [];
  const relationPaths = new Map<string, string>();
  for (const part of relationships.matchAll(/<Relationship\s+([^>]*?)\/?>(?:<\/Relationship>)?/g)) { const id = attr(part[1], "Id"); const target = attr(part[1], "Target"); if (id && target) relationPaths.set(id, target); }
  const sheets = [...workbook.matchAll(/<sheet\s+([^>]*?)\/?>(?:<\/sheet>)?/g)].map((part) => ({ name: decodeXml(attr(part[1], "name") ?? "Sheet"), relationId: attr(part[1], "r:id") }));
  if (sheets.length === 0 || sheets.length > MAX_SHEETS) throw new Error("XLSX has an unsupported number of worksheets");
  return { format: "xlsx", sheets: sheets.map((sheet) => {
    const target = sheet.relationId ? relationPaths.get(sheet.relationId) : null; if (!target || target.includes("..")) throw new Error("XLSX worksheet relationship is invalid");
    const worksheet = xml(entries, `xl/${target.replace(/^\//, "")}`)!; const rows: FinancialSpreadsheetRow[] = []; let cells = 0;
    for (const rowMatch of worksheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      if (rows.length >= MAX_ROWS_PER_SHEET) throw new Error("XLSX worksheet exceeds the 10,000-row intake limit");
      const rowNumber = Number(attr(rowMatch[1], "r") ?? rows.length + 1); const rowCells: FinancialSpreadsheetCell[] = [];
      for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
        if (++cells > MAX_CELLS_PER_SHEET) throw new Error("XLSX worksheet exceeds the 100,000-cell intake limit");
        const attributes = cellMatch[1] ?? cellMatch[3] ?? ""; const body = cellMatch[2] ?? ""; const ref = attr(attributes, "r") ?? `${columnReference(rowCells.length)}${rowNumber}`; const type = attr(attributes, "t"); const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        rowCells.push({ ref, value: type === "s" ? (sharedStrings[Number(raw)] ?? "") : type === "inlineStr" ? textContent(body) : decodeXml(raw) });
      }
      if (rowCells.length > 0) rows.push({ rowNumber, cells: rowCells });
    }
    return { name: sheet.name, rows };
  }) };
}

/** Extracts a transient, source-citable sheet representation; never persists workbook bytes. */
export async function extractFinancialSpreadsheet(buffer: Buffer, filename: string): Promise<FinancialSpreadsheet> {
  const extension = extensionFromName(filename);
  if (extension === "csv") { const name = filename.replace(/\.csv$/i, "").trim() || "Sheet1"; const rows = parseCsv(buffer.toString("utf8")).map((values, rowIndex) => ({ rowNumber: rowIndex + 1, cells: values.map((value, columnIndex) => ({ ref: `${columnReference(columnIndex)}${rowIndex + 1}`, value })) })); return { format: "csv", sheets: [{ name, rows }] }; }
  if (extension === "xlsx") return extractXlsx(buffer);
  throw new Error(`Unsupported spreadsheet file extension: ${extension || "unknown"}`);
}
