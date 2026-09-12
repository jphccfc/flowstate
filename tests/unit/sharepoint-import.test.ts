import { describe, expect, it, vi } from "vitest";
import { importDriveItem } from "../../lib/integrations/sharepoint-import";

const TOKEN = "secret-graph-token";
const ORG = "org_123";
const DOWNLOAD_URL = "https://contoso-my.sharepoint.com/download/preauth-abc";

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    name: "P&L 2026.pdf",
    size: 20480,
    webUrl: "https://contoso.sharepoint.com/sites/x/Documents/P&L.pdf",
    lastModifiedDateTime: "2026-09-01T10:00:00Z",
    file: { mimeType: "application/pdf", hashes: { quickXorHash: "HASH1" } },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fakeClient(existing: unknown = null) {
  const calls: { created: Record<string, unknown>[]; findUnique: unknown[] } = { created: [], findUnique: [] };
  return {
    calls,
    capturedInput: {
      findUnique: async (args: unknown) => {
        calls.findUnique.push(args);
        return existing;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async (args: any) => {
        calls.created.push(args);
        return { id: "captured_1", ...args.data };
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/** Responds to metadata with the item, then to /content with a 302 to the pre-auth URL. */
function graphFetch(itemBody: unknown, downloadBody = "extracted text") {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/content")) {
      return new Response(null, { status: 302, headers: { location: DOWNLOAD_URL } });
    }
    if (String(url) === DOWNLOAD_URL) {
      return new Response(downloadBody, { status: 200 });
    }
    if (String(url).includes("/items/item-1")) {
      return jsonResponse(itemBody);
    }
    return new Response("unexpected url: " + url, { status: 500 });
  });
}

describe("SharePoint item import", () => {
  it("imports a supported file as text evidence with provenance and no stored binary", async () => {
    const fetchImpl = graphFetch(item());
    const client = fakeClient();
    const extractText = vi.fn(async () => "Extracted PDF text");

    const result = await importDriveItem({
      organizationId: ORG,
      driveId: "drive-1",
      itemId: "item-1",
      accessToken: TOKEN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      extractText,
      client,
    });

    expect(result.status).toBe("imported");
    const data = client.calls.created[0].data as Record<string, unknown>;
    expect(data.organizationId).toBe(ORG);
    expect(data.type).toBe("DOCUMENT");
    expect(data.rawText).toBe("Extracted PDF text");
    expect(data.status).toBe("TRANSCRIBED");
    expect(data.reviewStatus).toBe("PENDING_REVIEW");
    expect(String(data.idempotencyKey)).toContain("HASH1");
    // no binary may be persisted anywhere
    const serialised = JSON.stringify(client.calls.created[0]);
    expect(serialised).not.toContain("Buffer");
    expect(serialised).not.toContain("base64");
    expect(serialised).not.toContain("downloadUrl");
  });

  it("does not send the bearer token to the pre-authenticated download host", async () => {
    const fetchImpl = graphFetch(item());
    await importDriveItem({
      organizationId: ORG,
      driveId: "drive-1",
      itemId: "item-1",
      accessToken: TOKEN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      extractText: async () => "text",
      client: fakeClient(),
    });

    const downloadCall = fetchImpl.mock.calls.find((c) => String(c[0]) === DOWNLOAD_URL);
    expect(downloadCall).toBeTruthy();
    const headers = (downloadCall?.[1]?.headers ?? {}) as Record<string, string>;
    expect(JSON.stringify(headers)).not.toContain(TOKEN);
  });

  it("reports a duplicate instead of re-importing an unchanged file", async () => {
    const client = fakeClient({ id: "captured_existing" });
    const result = await importDriveItem({
      organizationId: ORG,
      driveId: "drive-1",
      itemId: "item-1",
      accessToken: TOKEN,
      fetchImpl: graphFetch(item()) as unknown as typeof fetch,
      extractText: async () => "text",
      client,
    });
    expect(result).toEqual({ status: "duplicate", capturedInputId: "captured_existing" });
    expect(client.calls.created).toHaveLength(0);
  });

  it("skips folders rather than importing them", async () => {
    const result = await importDriveItem({
      organizationId: ORG,
      driveId: "drive-1",
      itemId: "item-1",
      accessToken: TOKEN,
      fetchImpl: graphFetch(item({ file: undefined, folder: { childCount: 4 } })) as unknown as typeof fetch,
      extractText: async () => "text",
      client: fakeClient(),
    });
    expect(result).toEqual({ status: "skipped", reason: "folder" });
  });

  it("skips an unsupported file type with a reason instead of failing silently", async () => {
    const result = await importDriveItem({
      organizationId: ORG,
      driveId: "drive-1",
      itemId: "item-1",
      accessToken: TOKEN,
      fetchImpl: graphFetch(item({ name: "Model.xlsx", file: { mimeType: "application/vnd.ms-excel", hashes: { quickXorHash: "H2" } } })) as unknown as typeof fetch,
      extractText: async () => "text",
      client: fakeClient(),
    });
    expect(result.status).toBe("skipped");
    expect((result as { reason: string }).reason).toMatch(/xlsx/);
  });

  it("still imports when Graph exposes no hash, using the version as the identity", async () => {
    const client = fakeClient();
    const result = await importDriveItem({
      organizationId: ORG,
      driveId: "drive-1",
      itemId: "item-1",
      accessToken: TOKEN,
      fetchImpl: graphFetch(item({ file: { mimeType: "application/pdf" } })) as unknown as typeof fetch,
      extractText: async () => "text",
      client,
    });
    expect(result.status).toBe("imported");
    const key = String((client.calls.created[0].data as Record<string, unknown>).idempotencyKey);
    expect(key).toContain("item-1");
    expect(key).toContain("2026-09-01T10:00:00Z");
  });

  it("throws on a Graph failure instead of recording empty evidence", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: "itemNotFound" } }, 404));
    await expect(importDriveItem({
      organizationId: ORG,
      driveId: "drive-1",
      itemId: "item-1",
      accessToken: TOKEN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      extractText: async () => "text",
      client: fakeClient(),
    })).rejects.toThrow(/itemNotFound|404/);
  });
});
