import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const admin = readFileSync(new URL("../../app/admin/agents/page.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../../app/clients/[id]/ai/page.tsx", import.meta.url), "utf8");

describe("agent identity placement", () => {
  it("places client identity configuration in platform admin and not FlowCoach chat", () => {
    expect(admin).toContain("Agent identity configuration");
    expect(admin).toContain("/agent-profiles");
    expect(admin).toContain("Save identity");
    expect(client).not.toContain("Give each published agent a memorable display name");
  });
});
