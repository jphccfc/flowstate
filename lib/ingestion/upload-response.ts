const STORAGE_CONFIGURATION_ERROR =
  "Audio storage configuration is unavailable. Please contact your administrator and try again.";
const GENERIC_UPLOAD_ERROR = "Audio upload failed. Please try again.";

type UploadResponseResult = { ok: true } | { ok: false; error: string };

function isHtmlDocument(body: string, contentType: string | null) {
  return contentType?.includes("text/html") || /^\s*(<!doctype\s+html|<html[\s>])/i.test(body);
}

export async function parseUploadResponse(response: Response): Promise<UploadResponseResult> {
  if (response.ok) return { ok: true };

  const body = await response.text();
  const contentType = response.headers.get("content-type");
  if (isHtmlDocument(body, contentType)) return { ok: false, error: STORAGE_CONFIGURATION_ERROR };

  if (contentType?.includes("application/json")) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === "object" && "error" in parsed && typeof parsed.error === "string" && parsed.error.trim()) {
        return { ok: false, error: parsed.error.trim() };
      }
    } catch {
      // Fall through to the safe plain-text handling below.
    }
  }

  const text = body.trim();
  return { ok: false, error: text || GENERIC_UPLOAD_ERROR };
}
