import { describe, expect, it } from "vitest";
import { parseUploadResponse } from "../../lib/ingestion/upload-response";

describe("live session upload responses", () => {
  it("preserves a JSON provider error message", async () => {
    const response = new Response(JSON.stringify({ error: "Blob provider rejected the upload" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });

    await expect(parseUploadResponse(response)).resolves.toEqual({
      ok: false,
      error: "Blob provider rejected the upload",
    });
  });

  it("preserves a plain-text provider error message", async () => {
    const response = new Response("Blob provider rejected the upload", { status: 502 });

    await expect(parseUploadResponse(response)).resolves.toEqual({
      ok: false,
      error: "Blob provider rejected the upload",
    });
  });

  it("replaces an HTML/Next error page with a safe actionable message", async () => {
    const response = new Response("<!DOCTYPE html><html><title>500: This page couldn’t load</title></html>", {
      status: 500,
      headers: { "content-type": "text/html" },
    });

    const result = await parseUploadResponse(response);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected an upload error");
    expect(result.error).toContain("storage configuration");
    expect(result.error).not.toContain("<html>");
  });

  it("accepts a successful upload response", async () => {
    const response = new Response(JSON.stringify({ id: "capture-1" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });

    await expect(parseUploadResponse(response)).resolves.toEqual({ ok: true });
  });
});
