import pdfParse from "pdf-parse";
import * as mammoth from "mammoth";

export async function extractDocumentText(fileUrl: string): Promise<string> {
  const response = await fetch(fileUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  const extension = fileUrl.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    const result = await pdfParse(buffer);
    return result.text;
  }
  if (extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  throw new Error(`Unsupported document file extension: ${extension}`);
}
