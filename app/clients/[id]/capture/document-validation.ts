const DOCUMENT_EXTENSIONS = new Set(["pdf", "docx"]);
const SPREADSHEET_EXTENSIONS = new Set(["csv", "xlsx"]);

export function validateDocumentFile(file: File | null): string | null {
  if (!file) return null;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension && DOCUMENT_EXTENSIONS.has(extension) ? null : "Documents must be PDF or DOCX files";
}

export function validateSpreadsheetFile(file: File | null): string | null {
  if (!file) return null;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !SPREADSHEET_EXTENSIONS.has(extension)) return "Spreadsheets must be CSV or XLSX files";
  if (file.size > 20 * 1024 * 1024) return "Spreadsheets must be 20 MB or smaller";
  return null;
}
