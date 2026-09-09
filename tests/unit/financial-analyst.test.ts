import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/ai/route.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "app/admin/agents/page.tsx"), "utf8");

describe("Financial Analyst specialist", () => {
  it("defines a reviewed, bounded financial analysis preset", async () => {
    const { FINANCIAL_ANALYST_PRESET } = await import("@/lib/agents/presets");
    expect(FINANCIAL_ANALYST_PRESET.key).toBe("financial_analyst");
    expect(FINANCIAL_ANALYST_PRESET.agentType).toBe("SPECIALIST");
    expect(FINANCIAL_ANALYST_PRESET.prompt).toMatch(/financial statements|management accounts/i);
    expect(FINANCIAL_ANALYST_PRESET.prompt).toMatch(/reported|calculated|forecast/i);
    expect(FINANCIAL_ANALYST_PRESET.prompt).toMatch(/assumption/i);
    expect(FINANCIAL_ANALYST_PRESET.prompt).toMatch(/investment|lending|accounting/i);
    expect(FINANCIAL_ANALYST_PRESET.inputRules).toEqual(expect.arrayContaining([
      { inputType: "DOCUMENT", domainIdentifier: "finance" },
      { inputType: "DATA_ROOM_FILE", domainIdentifier: "finance" },
    ]));
  });

  it("keeps the orchestrator as the default while allowing an explicit published specialist key", () => {
    expect(route).toContain('const requestedAgentKey = typeof body?.agentKey === "string" ? body.agentKey : "client_ai_hub";');
    expect(route).toContain("safeAgentIdentifier.test(requestedAgentKey)");
    expect(route).toContain("requestedAgentKey === \"client_ai_hub\"");
    expect(route).toContain("agentKey");
    expect(route).toContain('agentType: "SPECIALIST"');
    expect(route).toContain("publishedPromptVersion");
  });

  it("makes the reviewed preset available in the admin catalogue without creating a fake record", () => {
    expect(page).toContain("FINANCIAL_ANALYST_PRESET");
    expect(page).toContain("Use Financial Analyst preset");
    expect(page).toContain("Publish a prompt version after review");
  });
});
