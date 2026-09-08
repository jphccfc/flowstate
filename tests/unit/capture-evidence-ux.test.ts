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

  it("shows a successful capture confirmation with a review handoff", () => {
    expect(capture).toContain("Capture submitted");
    expect(capture).toContain("Review the extracted tags before they are used in assessment or planning.");
    expect(capture).toContain("Review captured evidence →");
    expect(capture).toContain("setCaptureSubmitted(true)");
  });

  it("uses contextual upload actions while preserving text Capture and valid-file gating", () => {
    expect(capture).toContain('"Upload document"');
    expect(capture).toContain('"Upload audio"');
    expect(capture).toContain('"Upload file"');
    expect(capture).toContain('"Capture"');
    expect(capture).toContain("!file || !!fileError");
    expect(capture).toContain('fetch("/api/captured-inputs", { method: "POST", body: formData })');
    expect(capture).toContain("validateDocumentFile");
    expect(capture).toContain("setSubmitError(await readErrorMessage(res))");
    expect(capture).toContain("return body;");
  });
  it("summarizes capture processing and takes users directly to tag review", () => {
    expect(capture).toContain("Capture status");
    expect(capture).toContain("Needs review");
    expect(capture).toContain("Processing");
    expect(capture).toContain("Failed");
    expect(capture).toContain('href={`/clients/${organizationId}/review`}');
    expect(capture).toContain("Review extracted tags");
  });

  it("provides a fast meeting agenda and durable scratchpad controls", () => {
    expect(capture).toContain("Meeting agenda (optional)");
    expect(capture).toContain("dateTime");
    expect(capture).toContain("agendaItems");
    expect(capture).toContain("localStorage");
    expect(capture).toContain("offline");
    expect(capture).toContain("stakeholders");
    expect(capture).toContain("domain");
  });

  it("makes the Meeting Scratch Pad discoverable from Capture Evidence", () => {
    expect(capture).toContain("Open Meeting Scratch Pad");
    expect(capture).toContain("/scratchpad");
  });

  it("links to agenda management and carries the selected context into Scratch Pad", () => {
    expect(capture).toContain("Meeting Agendas");
    expect(capture).toContain('href={`/clients/${organizationId}/meetings`}');
    expect(capture).toContain('aria-label="Meeting context"');
    expect(capture).toContain("contexts.map");
    expect(capture).toContain('value={meetingContextId}');
    expect(capture).toContain("contextId=${encodeURIComponent(meetingContextId)}");
  });

  it("gives explicit meeting-context save feedback and refreshes persisted context", () => {
    expect(capture).toContain("Meeting context is being saved…");
    expect(capture).toContain("Meeting context saved and stored in Meeting Context.");
    expect(capture).toContain("Meeting context could not be saved");
    expect(capture).toContain("HTTP");
    expect(capture).toContain("setContextSaveStatus");
    expect(capture).toContain("loadInputs();");
  });

  it("provides microphone capture controls and visible retry/status feedback in a live session", () => {
    const session = readFileSync(resolve(root, "app/clients/[id]/session/[sessionId]/page.tsx"), "utf8");
    expect(session).toContain("navigator.mediaDevices.getUserMedia");
    expect(session).toContain("MediaRecorder");
    expect(session).toContain("Start recording");
    expect(session).toContain("Pause recording");
    expect(session).toContain("Resume recording");
    expect(session).toContain("Stop and save");
    expect(session).toContain("Microphone permission");
    expect(session).toContain("Retry upload");
    expect(session).toContain("/api/captured-inputs");
    expect(session).toContain('formData.append("type", "AUDIO")');
  });
});
