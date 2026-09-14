import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isSelectableLibrary, listSharePointSites, GRAPH_BASE } from "../../lib/integrations/graph";

const TOKEN = "test-token";
const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/integrations/sharepoint/page.tsx"), "utf8");
const browseRoute = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/integrations/sharepoint/browse/route.ts"), "utf8");

describe("site enumeration", () => {
  it("always sends a search term, because Graph returns an empty collection without one", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ value: [] }));
    await listSharePointSites(TOKEN, { fetchImpl });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toContain("search=");
    // Encoded "*": the call that returned 11 sites against the live tenant.
    expect(decodeURIComponent(url.split("search=")[1])).toBe("*");
  });

  it("defaults a blank search term to * rather than dropping the parameter", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ value: [] }));
    await listSharePointSites(TOKEN, { search: "   ", fetchImpl });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(decodeURIComponent(url.split("search=")[1])).toBe("*");
  });

  it("honours an explicit search term", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ value: [] }));
    await listSharePointSites(TOKEN, { search: "flowstate", fetchImpl });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(decodeURIComponent(url.split("search=")[1])).toBe("flowstate");
  });

  it("maps display names and falls back when a site has none", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      value: [
        { id: "1", displayName: "Flow State Partners", webUrl: "https://x.sharepoint.com/sites/fs" },
        { id: "2", name: "fallback-name" },
        { id: "3" },
      ],
    }));
    const sites = await listSharePointSites(TOKEN, { fetchImpl });
    expect(sites[0].name).toBe("Flow State Partners");
    expect(sites[1].name).toBe("fallback-name");
    expect(sites[2].name).toBe("(unnamed site)");
  });

  it("targets the documented Graph sites endpoint", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ value: [] }));
    await listSharePointSites(TOKEN, { fetchImpl });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url.startsWith(`${GRAPH_BASE}/sites?`)).toBe(true);
  });

  it("still surfaces provider errors rather than an empty list", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: "Forbidden" } }, 403));
    await expect(listSharePointSites(TOKEN, { fetchImpl })).rejects.toThrow(/Forbidden/);
  });
});

describe("library filtering", () => {
  it("hides SharePoint system libraries", () => {
    for (const name of ["Form Templates", "Site Assets", "Site Pages", "Style Library", "_catalogs", "App Catalog"]) {
      expect(isSelectableLibrary(name)).toBe(false);
    }
  });

  it("keeps real document libraries", () => {
    for (const name of ["Documents", "Shared Documents", "Client Evidence", "Finance"]) {
      expect(isSelectableLibrary(name)).toBe(true);
    }
  });

  it("is applied by the browse route", () => {
    expect(browseRoute).toContain("isSelectableLibrary(library.name)");
  });
});

describe("source pickers", () => {
  it("offers a select for site and library rather than free text when connected", () => {
    expect(page).toContain('aria-label="SharePoint site"');
    expect(page).toContain('aria-label="Document library"');
    expect(page).not.toContain('placeholder={`SharePoint site`}');
  });

  it("loads sites from Graph once a connection exists", () => {
    expect(page).toContain('browse("resource=sites"');
    expect(page).toContain("if (!isConnected) return;");
  });

  it("chains site to libraries and library to folders", () => {
    expect(page).toContain("resource=libraries&siteId=");
    expect(page).toContain("resource=items&driveId=");
  });

  it("explains an empty site list instead of showing a silent empty picker", () => {
    expect(page).toContain("No SharePoint sites were returned for this account");
  });

  it("hides system folders from the folder list", () => {
    expect(page).toContain("SYSTEM_FOLDERS");
    expect(page).toContain("filter(isSelectableFolder)");
  });

  it("reports a browse failure instead of failing silently", () => {
    expect(page).toContain("setBrowseError");
    expect(page).toContain('role="alert"');
  });
});
