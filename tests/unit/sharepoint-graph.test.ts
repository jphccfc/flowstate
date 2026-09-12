import { describe, expect, it, vi } from "vitest";
import {
  listDocumentLibraries,
  listDriveChildren,
  listSharePointSites,
  GRAPH_BASE,
} from "../../lib/integrations/graph";

const TOKEN = "secret-access-token";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Graph site and library discovery", () => {
  it("searches sites with a bearer token and maps the fields the UI needs", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      value: [{ id: "site-1", displayName: "Client Data Room", name: "data-room", webUrl: "https://contoso.sharepoint.com/sites/data-room" }],
    }));

    const sites = await listSharePointSites(TOKEN, { search: "data room", fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith(`${GRAPH_BASE}/sites?`)).toBe(true);
    expect(url).toContain("search=data");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(sites).toEqual([
      { id: "site-1", name: "Client Data Room", webUrl: "https://contoso.sharepoint.com/sites/data-room" },
    ]);
  });

  it("lists document libraries for a site", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      value: [{ id: "drive-1", name: "Documents", webUrl: "https://contoso.sharepoint.com/sites/x/Documents" }],
    }));
    const libraries = await listDocumentLibraries(TOKEN, "site-1", { fetchImpl });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe(`${GRAPH_BASE}/sites/site-1/drives`);
    expect(libraries[0]).toEqual({ id: "drive-1", name: "Documents", webUrl: "https://contoso.sharepoint.com/sites/x/Documents" });
  });

  it("lists folder children and distinguishes folders from files", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      value: [
        { id: "item-folder", name: "Evidence", folder: { childCount: 3 }, size: 0, lastModifiedDateTime: "2026-09-01T10:00:00Z", webUrl: "https://x" },
        { id: "item-file", name: "P&L 2026.xlsx", file: { mimeType: "application/vnd.ms-excel" }, size: 4096, lastModifiedDateTime: "2026-09-02T10:00:00Z", webUrl: "https://y" },
      ],
    }));
    const children = await listDriveChildren(TOKEN, "drive-1", "root", { fetchImpl });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toContain(`${GRAPH_BASE}/drives/drive-1/items/root/children`);
    expect(children[0]).toMatchObject({ id: "item-folder", name: "Evidence", isFolder: true });
    expect(children[1]).toMatchObject({ id: "item-file", name: "P&L 2026.xlsx", isFolder: false, size: 4096 });
  });

  it("throws on a Graph error instead of silently returning no results", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: "InvalidAuthenticationToken", message: "Access token has expired." } }, 401));
    await expect(listSharePointSites(TOKEN, { fetchImpl })).rejects.toThrow(/401|InvalidAuthenticationToken/);
  });

  it("never includes the access token in an error message", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: "Forbidden", message: "Insufficient privileges." } }, 403));
    await expect(listSharePointSites(TOKEN, { fetchImpl })).rejects.toSatisfy(
      (error: Error) => !error.message.includes(TOKEN),
    );
  });

  it("refuses to call Graph without a token", async () => {
    const fetchImpl = vi.fn();
    await expect(listSharePointSites("", { fetchImpl })).rejects.toThrow(/token/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
