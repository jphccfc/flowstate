import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderAnswerWithCitations } from "../../lib/ai/citations";

describe("FlowCoach answer citations", () => {
  it("links only in-range numeric citations to safe current-workspace source routes", () => {
    const markup = renderToStaticMarkup(renderAnswerWithCitations(
      "See [1] and [2].\nUnknown [3] and <script>alert(1)</script>.",
      [
        { id: "doc-1", kind: "document", title: "Document", date: "2026-01-01", excerpt: "Excerpt", href: "/clients/workspace-1/capture" },
        { id: "kpi-1", kind: "KPI record", title: "KPI", date: "2026-01-01", excerpt: "Excerpt", href: "https://evil.example/phish" },
      ],
      "workspace-1",
    ));

    expect(markup).toContain('See <a href="/clients/workspace-1/capture">[1]</a> and [2].');
    expect(markup).toContain("Unknown [3]");
    expect(markup).not.toContain("evil.example");
    expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(markup).toContain("\n");
  });

  it("leaves a citation plain when its server href does not match the source allowlist", () => {
    const markup = renderToStaticMarkup(renderAnswerWithCitations(
      "[1]",
      [{ id: "doc-1", kind: "document", title: "Document", date: "2026-01-01", excerpt: "Excerpt", href: "/clients/other-workspace/capture" }],
      "workspace-1",
    ));

    expect(markup).toBe("[1]");
  });
});
