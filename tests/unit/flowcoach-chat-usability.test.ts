import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const component = readFileSync(resolve(root, "components/ai/AskAIAssistant.tsx"), "utf8");
const css = readFileSync(resolve(root, "app/globals.css"), "utf8");

describe("Flow Coach chat usability contract", () => {
  it("provides a clear conversation reset action", () => {
    expect(component).toContain("Clear chat / New conversation");
    expect(component).toContain("setMessages([])");
  });

  it("provides panel expand state and accessible control", () => {
    expect(component).toContain("expanded");
    expect(component).toContain("aria-expanded");
    expect(component).toContain("Expand FlowCoach");
  });

  it("renders concise-first answer and expandable supporting detail", () => {
    expect(component).toContain("Answer summary");
    expect(component).toContain("Supporting documents");
    expect(component).toContain("<details");
  });

  it("allows the chat panel to be resized without horizontal clipping", () => {
    expect(css).toContain("resize: both");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("min-width: 0");
  });
});
