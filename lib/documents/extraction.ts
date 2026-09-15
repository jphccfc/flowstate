export type SupportedDocumentExtension = "pdf" | "docx";

function extensionFromName(name: string): string {
  const match = name.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

/**
 * Extracts text from already-fetched bytes. The caller owns the transient buffer;
 * this function never writes it to disk or external storage.
 *
 * Parsers are deliberately loaded lazily. pdf-parse requires DOMMatrix in some
 * versions; loading it at module initialisation made every DOCX import fail in
 * the serverless runtime before the DOCX parser was even selected.
 */
export async function extractDocumentTextFromBuffer(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const extension = extensionFromName(filename);
  if (extension === "pdf") {
    // pdfjs-dist expects browser geometry globals. A pure-JavaScript DOMMatrix
    // implementation keeps this route compatible with the serverless bundle;
    // native canvas bindings are rejected by Turbopack.
    const { default: DOMMatrixPolyfill } = await import("@thednp/dommatrix");
    const globals = globalThis as unknown as { DOMMatrix?: unknown };
    globals.DOMMatrix ??= DOMMatrixPolyfill;
    const { PDFParse } = await import("pdf-parse");
    // Vercel's server runtime cannot resolve pdf-parse's default relative
    // worker chunk. Point pdfjs at the dependency's deployed worker instead.
    PDFParse.setWorker(`${process.cwd()}/public/pdf.worker.mjs`);
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  if (extension === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  throw new Error(`Unsupported document file extension: ${extension || "unknown"}`);
}

/** Compatibility helper for callers that provide a URL with a meaningful filename. */
export async function extractDocumentText(fileUrl: string): Promise<string> {
  const response = await fetch(fileUrl);
  if (response.ok === false) throw new Error(`Document download failed (HTTP ${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = new URL(fileUrl).pathname.split("/").pop() ?? fileUrl;
  return extractDocumentTextFromBuffer(buffer, filename);
}
