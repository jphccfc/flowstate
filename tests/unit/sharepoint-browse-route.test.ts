import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(
  resolve(process.cwd(), "app/api/clients/[id]/integrations/sharepoint/browse/route.ts"),
  "utf8",
);

describe("SharePoint browse route", () => {
  it("authenticates and requires the client.configure permission", () => {
    expect(route).toContain("auth.getUser()");
    expect(route).toContain('hasOrganizationPermission(user.email, id, "client.configure")');
    expect(route).toContain("{ status: 401 }");
    expect(route).toContain("{ status: 403 }");
  });

  it("looks the connection up by the route organisation, not a client-supplied one", () => {
    expect(route).toContain("getAccessToken(prisma, id)");
    expect(route).not.toContain("searchParams.get(\"organizationId\")");
  });

  it("refuses to browse when the client has no connection", () => {
    expect(route).toContain('{ status: 409 }');
    expect(route).toContain("SharePoint is not connected");
  });

  it("supports sites, libraries and folder items only", () => {
    expect(route).toContain('resource === "sites"');
    expect(route).toContain('resource === "libraries"');
    expect(route).toContain('resource === "items"');
    expect(route).toContain("Unsupported resource");
    expect(route).toContain("siteId is required");
    expect(route).toContain("driveId is required");
  });

  it("is read-only and never returns the access token", () => {
    expect(route).toContain("export async function GET");
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(route).not.toMatch(/NextResponse\.json\([^)]*accessToken/);
    expect(route).toContain("connection.accessToken");
  });

  it("maps provider failures to 502 rather than a successful empty list", () => {
    expect(route).toContain("{ status: 502 }");
  });
});
