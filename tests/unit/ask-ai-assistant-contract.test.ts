import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const assistant = readFileSync(resolve(root, "components/ai/AskAIAssistant.tsx"), "utf8");
const layout = readFileSync(resolve(root, "app/clients/[id]/layout.tsx"), "utf8");
const styles = readFileSync(resolve(root, "app/globals.css"), "utf8");

describe("persistent client Ask AI assistant contract", () => {
  it("is mounted by the client workspace shell with the current client id", () => {
    expect(layout).toContain("AskAIAssistant");
    expect(layout).toContain("clientId={id}");
    expect(assistant).toContain('fetch(`/api/clients/${clientId}/ai`');
  });

  it("provides an accessible collapsed launcher and expandable question flow", () => {
    expect(assistant).toContain('aria-label="Ask AI"');
    expect(assistant).toContain("aria-expanded={open}");
    expect(assistant).toContain('aria-label="Close Ask AI"');
    expect(assistant).toContain('aria-label="Ask AI Hub question"');
    expect(assistant).toContain("Searching…");
    expect(assistant).toContain('role="alert"');
    expect(assistant).toContain("Sources");
    expect(assistant).toContain("source.title");
    expect(assistant).toContain("source.kind");
    expect(assistant).toContain("source.excerpt");
    expect(assistant).toContain("source.href");
    expect(assistant).toContain("<a");
    expect(assistant).toContain("conversation");
    expect(assistant).toContain("New chat");
    expect(assistant).toContain("aria-live=\"polite\"");
  });

  it("keeps the floating panel responsive and above workspace content", () => {
    expect(styles).toContain(".ask-ai-assistant");
    expect(styles).toContain("position: fixed");
    expect(styles).toContain("z-index: 40");
    expect(styles).toContain("width: min(24rem, calc(100vw - 2rem))");
    expect(styles).toContain("@media (max-width: 520px)");
  });
});
