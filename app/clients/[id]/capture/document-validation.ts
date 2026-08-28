const DOCUMENT_EXTENSIONS = new Set(["pdf", "docx"]);

export function validateDocumentFile(file: File | null): string | null {
  if (!file) return null;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension && DOCUMENT_EXTENSIONS.has(extension) ? null : "Documents must be PDF or DOCX files";
}
