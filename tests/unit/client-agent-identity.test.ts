import { describe, expect, it } from "vitest";
import { normalizeAgentAlias, validateAgentAlias } from "../../lib/agents/identity";

describe("client agent identity", () => {
  it("normalizes display aliases for uniqueness checks", () => {
    expect(normalizeAgentAlias("  Freddy Finance  ")).toBe("freddy finance");
    expect(normalizeAgentAlias("Ollie   Orchestrator")).toBe("ollie orchestrator");
  });

  it("accepts practical client-facing names", () => {
    expect(validateAgentAlias("Freddy Finance")).toBe(true);
    expect(validateAgentAlias("Ollie Orchestrator")).toBe(true);
  });

  it("rejects empty, overly long, and unsafe aliases", () => {
    expect(validateAgentAlias(" ")).toBe(false);
    expect(validateAgentAlias("a".repeat(81))).toBe(false);
    expect(validateAgentAlias("<script>alert(1)</script>")).toBe(false);
  });
});
