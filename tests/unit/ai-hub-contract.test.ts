import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/ai/route.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/ai/page.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "components/layout/WorkspaceNav.tsx"), "utf8");

describe("client AI Hub contract", () => {
  it("exposes a client-facing question flow with citations and no-results state", () => {
    expect(nav).toContain('label: "FlowCoach"');
    expect(page).toContain("FlowCoach");
    expect(page).toContain("Ask FlowCoach");
    expect(page).toContain("Sources");
    expect(page).toContain("No matching authorized workspace sources");
    expect(page).toContain("source.href");
    expect(page).toContain("<a");
    expect(page).toContain("CopyAnswerButton");
    expect(page).toContain("result.answer");
  });

  it("preserves the API route and agent identity while renaming the UI", () => {
    expect(page).toContain("/api/clients/${organizationId}/ai");
    expect(route).toContain('key: "client_ai_hub"');
  });

  it("uses the local Flowstate mark for the platform brand", () => {
    expect(nav).toContain('src="/flowstate-mark.svg"');
    expect(nav).toContain('alt=""');
    expect(nav).toContain("workspace-brand-mark");
  });

  it("authenticates and scopes every workspace query to the route organization", () => {
    expect(route).toContain("canAccessClient(user.email, organizationId)");
    expect(route).toContain("where: { organizationId");
    expect(route).toContain("publishedPromptVersion");
    expect(route).toContain("parseConversation");
    expect(route).toContain("conversation");
    expect(route).toContain("retrieved for the current question only");
    expect(route).not.toMatch(/\$queryRaw|SELECT\s+\*|tableName|sql/i);
  });
});
