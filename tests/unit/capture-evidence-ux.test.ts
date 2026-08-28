import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const nav = readFileSync(resolve(root, "components/layout/WorkspaceNav.tsx"), "utf8");
const overview = readFileSync(resolve(root, "app/clients/[id]/page.tsx"), "utf8");
const capture = readFileSync(resolve(root, "app/clients/[id]/capture/page.tsx"), "utf8");

describe("capture evidence UX contract", () => {
  it("exposes Capture evidence from shared navigation and client overview", () => {
    expect(nav).toContain('href: `/clients/${clientId}/capture`');
    expect(nav).toContain('label: "Capture evidence"');
    expect(overview).toContain('href: `/clients/${id}/capture`');
    expect(overview).toContain('label: "Capture evidence"');
    expect(overview).toContain("Open capture evidence");
  });

  it("uses an accessible styled chooser with contextual labels and filename feedback", () => {
    expect(capture).toContain('useRef<HTMLInputElement>(null)');
    expect(capture).toContain('type="file"');
    expect(capture).toContain('className="sr-only"');
    expect(capture).toContain('htmlFor="capture-file"');
    expect(capture).toContain("Choose document");
    expect(capture).toContain("Choose audio");
    expect(capture).toContain("Choose file");
    expect(capture).toContain("file.name");
  });

  it("uses contextual upload actions while preserving text Capture and valid-file gating", () => {
    expect(capture).toContain('"Upload document"');
    expect(capture).toContain('"Upload audio"');
    expect(capture).toContain('"Upload file"');
    expect(capture).toContain('"Capture"');
    expect(capture).toContain("!file || !!fileError");
    expect(capture).toContain('fetch("/api/captured-inputs", { method: "POST", body: formData })');
    expect(capture).toContain("validateDocumentFile");
  });

  it("can focus a capture record when provenance links back from planning", () => {
    expect(capture).toContain("captureId");
    expect(capture).toContain("Referenced capture");
    expect(capture).toContain("aria-current");
  });
});
