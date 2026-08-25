import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

describe("action button contrast", () => {
  it("defines dark readable backgrounds for success and accent buttons in both themes", () => {
    expect(css).toContain(".flowstate-success-button");
    expect(css).toContain(".flowstate-accent-button");
    expect(css).toContain("--button-success-bg: #166534");
    expect(css).toContain("--button-accent-bg: #075985");
    expect(css).toContain(":root[data-theme=\"dark\"]");
  });
});
