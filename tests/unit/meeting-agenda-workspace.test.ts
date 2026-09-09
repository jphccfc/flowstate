import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspace = readFileSync(resolve(process.cwd(), "app/clients/[id]/meetings/page.tsx"), "utf8");
const overview = readFileSync(resolve(process.cwd(), "app/clients/[id]/page.tsx"), "utf8");
const scratchpad = readFileSync(resolve(process.cwd(), "app/clients/[id]/scratchpad/page.tsx"), "utf8");
const capture = readFileSync(resolve(process.cwd(), "app/clients/[id]/capture/page.tsx"), "utf8");

describe("meeting agenda workspace contract", () => {
  it("provides a client workspace entry point and agenda management controls", () => {
    expect(overview).toContain("/meetings");
    expect(workspace).toContain("Meeting Agendas");
    expect(workspace).toContain("Create agenda");
    expect(workspace).toContain("Update agenda");
    expect(workspace).toContain("Start Scratch Pad");
  });

  it("shows agenda fields, linked capture counts, and safe states", () => {
    for (const label of ["Objectives", "Agenda items", "Linked captures", "No meeting agendas yet", "Loading meeting agendas", "role=\"alert\""]) {
      expect(workspace).toContain(label);
    }
  });

  it("supports clearly labelled pasted agenda text ingestion", () => {
    expect(workspace).toContain("Paste agenda text");
    expect(workspace).toContain("Import agenda items");
    expect(workspace).toContain("split(\"\\n\")");
  });

  it("links every agenda start action to Scratch Pad with its context identifier", () => {
    expect(workspace).toContain("/scratchpad?contextId=");
    expect(workspace).toContain("encodeURIComponent(context.id)");
  });
});

describe("scratch pad agenda linkage contract", () => {
  it("reads a context query parameter and visibly displays the selected agenda", () => {
    expect(scratchpad).toContain("useSearchParams");
    expect(scratchpad).toContain("contextId");
    expect(scratchpad).toContain("Selected agenda context");
    expect(scratchpad).toContain("No context / start capturing now");
  });

  it("does not infer a context from the first saved note when no agenda is requested", () => {
    expect(scratchpad).toContain("const linkedContextId = requestedContextId;");
    expect(scratchpad).not.toContain("requestedContextId || rows[0].meetingContextId");
    expect(scratchpad).toContain("contextId: contextRef.current || null");
  });
});

describe("organization domain selector contract", () => {
  it("loads authorized organization domains for the meeting agenda selector", () => {
    expect(workspace).toContain("/api/clients/${organizationId}");
    expect(workspace).toContain("organizationDomains");
    expect(workspace).not.toContain("const domains = [");
  });

  it("loads the same organization domains for Capture and keeps selected values available", () => {
    expect(capture).toContain("/api/clients/${organizationId}");
    expect(capture).toContain("organizationDomains");
    expect(capture).not.toContain("[\"Operations\", \"Financial and Legal\", \"People\", \"Technology and Data\", \"Customers and Revenue\"]");
  });
});
