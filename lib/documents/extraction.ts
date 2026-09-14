import { PDFParse } from "pdf-parse";
import * as mammoth from "mammoth";

export type SupportedDocumentExtension = "pdf" | "docx";

function extensionFromName(name: string): string {
  const match = name.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

/**
 * Extracts text from already-fetched bytes. The caller owns the transient buffer;
 * this function never writes it to disk or external storage.
 */
export async function extractDocumentTextFromBuffer(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const extension = extensionFromName(filename);
  if (extension === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  if (extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  throw new Error(`Unsupported document file extension: ${extension || "unknown"}`);
}

/**
 * Compatibility helper for non-SharePoint callers that provide a URL with a
 * meaningful filename extension. SharePoint imports use the buffer helper above
 * because Graph's pre-authenticated download URLs have opaque names.
 */
export async function extractDocumentText(fileUrl: string): Promise<string> {
  const response = await fetch(fileUrl);
  if (response.ok === false) throw new Error(`Document download failed (HTTP ${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = new URL(fileUrl).pathname.split("/").pop() ?? fileUrl;
  return extractDocumentTextFromBuffer(buffer, filename);
}
