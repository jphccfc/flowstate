const DOCUMENT_EXTENSIONS = new Set(["pdf", "docx"]);

export function validateDocumentFile(file: File | null): string | null {
  if (!file) return "Choose a PDF or DOCX file.";
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension && DOCUMENT_EXTENSIONS.has(extension)
    ? null
    : "Documents must be PDF or DOCX files.";
}
