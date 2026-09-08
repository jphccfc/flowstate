"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import { validateDocumentFile } from "./document-validation";
import Link from "next/link";
import { useRouter } from "next/navigation";

type CapturedInputType = "TEXT_NOTE" | "EMAIL" | "AUDIO" | "DOCUMENT" | "DATA_ROOM_FILE";

const FILE_TYPES = new Set<CapturedInputType>(["AUDIO", "DOCUMENT", "DATA_ROOM_FILE"]);

type CapturedInput = {
  id: string;
  type: string;
  status: string;
  error: string | null;
  createdAt: string;
  meetingContextId?: string | null;
};

type MeetingContext = { id: string; title: string; startsAt: string | null; dateTime?: string | null; stakeholderName: string | null; stakeholders?: string[]; domainName: string | null; domain?: string | null; objectives: string | null; agendaItems: string[]; desiredOutcome: string | null };

export default function CapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const router = useRouter();
  const [type, setType] = useState<CapturedInputType>("TEXT_NOTE");
  const [rawText, setRawText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [locationTag, setLocationTag] = useState("");
  const [meetingContextId, setMeetingContextId] = useState("");
  const [contextTitle, setContextTitle] = useState("");
  const [contextDate, setContextDate] = useState("");
  const [contextStakeholder, setContextStakeholder] = useState("");
  const [contextDomain, setContextDomain] = useState("");
  const [contextObjectives, setContextObjectives] = useState("");
  const [contextAgenda, setContextAgenda] = useState("");
  const [contextOutcome, setContextOutcome] = useState("");
  const [contextSaving, setContextSaving] = useState(false);
  const [contextSaveStatus, setContextSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [contextSaveError, setContextSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [inputs, setInputs] = useState<CapturedInput[]>([]);
  const [captureSubmitted, setCaptureSubmitted] = useState(false);
  const [inboundEmail, setInboundEmail] = useState<{ inboundAddress: string; active: boolean } | null>(null);
  const [inboundEmailLoading, setInboundEmailLoading] = useState(false);

  const isFileType = FILE_TYPES.has(type);
  const statusCounts = {
    needsReview: inputs.filter((input) => input.status === "TAGGED").length,
    processing: inputs.filter((input) => ["PENDING", "TRANSCRIBED"].includes(input.status)).length,
    failed: inputs.filter((input) => input.status === "FAILED").length,
  };
  const chooserLabels: Record<"AUDIO" | "DOCUMENT" | "DATA_ROOM_FILE", string> = {
    DOCUMENT: "Choose document",
    AUDIO: "Choose audio",
    DATA_ROOM_FILE: "Choose file",
  };
  const actionLabels: Record<"AUDIO" | "DOCUMENT" | "DATA_ROOM_FILE", string> = {
    DOCUMENT: "Upload document",
    AUDIO: "Upload audio",
    DATA_ROOM_FILE: "Upload file",
  };

  const loadInputs = useCallback(async () => {
    const res = await fetch(`/api/captured-inputs?organizationId=${organizationId}`);
    if (res.ok) setInputs(await res.json());
    const contextRes = await fetch(`/api/meeting-contexts?organizationId=${organizationId}`);
    if (contextRes.ok) {
      const contexts: MeetingContext[] = await contextRes.json();
      const last = contexts[0];
      if (last && !meetingContextId) { setMeetingContextId(last.id); setContextTitle(last.title); setContextStakeholder(last.stakeholderName ?? ""); setContextDomain(last.domainName ?? ""); }
    }
  }, [organizationId, meetingContextId]);

  useEffect(() => {
    const saved = localStorage.getItem(`flowstate-meeting-draft:${organizationId}`);
    if (saved) { window.setTimeout(() => { try { const draft = JSON.parse(saved) as Partial<{ title: string; startsAt: string; stakeholderName: string; domainName: string; objectives: string; agendaItems: string; desiredOutcome: string }>; setContextTitle(draft.title ?? ""); setContextDate(draft.startsAt ?? ""); setContextStakeholder(draft.stakeholderName ?? ""); setContextDomain(draft.domainName ?? ""); setContextObjectives(draft.objectives ?? ""); setContextAgenda(draft.agendaItems ?? ""); setContextOutcome(draft.desiredOutcome ?? ""); } catch { /* ignore malformed local draft */ } }, 0); }
    // Remote capture polling intentionally updates state after each fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInputs();
    fetch(`/api/clients/${organizationId}/inbound-email`).then((res) => res.ok ? res.json() : null).then(setInboundEmail);
    const interval = setInterval(loadInputs, 3000);
    return () => clearInterval(interval);
  }, [loadInputs, organizationId]);

  useEffect(() => { localStorage.setItem(`flowstate-meeting-draft:${organizationId}`, JSON.stringify({ title: contextTitle, startsAt: contextDate, stakeholderName: contextStakeholder, domainName: contextDomain, objectives: contextObjectives, agendaItems: contextAgenda, desiredOutcome: contextOutcome })); }, [organizationId, contextTitle, contextDate, contextStakeholder, contextDomain, contextObjectives, contextAgenda, contextOutcome]);
  useEffect(() => {
    const flushOfflineNotes = async () => {
      if (!navigator.onLine) return;
      const key = `flowstate-offline-captures:${organizationId}`;
      const queued = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<{ type: CapturedInputType; rawText: string; meetingContextId?: string }>;
      if (queued.length === 0) return;
      const remaining = [];
      for (const item of queued) {
        const formData = new FormData();
        formData.append("organizationId", organizationId);
        formData.append("type", item.type);
        formData.append("rawText", item.rawText);
        if (item.meetingContextId) formData.append("meetingContextId", item.meetingContextId);
        try { if (!(await fetch("/api/captured-inputs", { method: "POST", body: formData })).ok) remaining.push(item); } catch { remaining.push(item); }
      }
      localStorage.setItem(key, JSON.stringify(remaining));
      if (remaining.length !== queued.length) loadInputs();
    };
    window.addEventListener("online", flushOfflineNotes);
    flushOfflineNotes();
    return () => window.removeEventListener("online", flushOfflineNotes);
  }, [organizationId, loadInputs]);

  async function saveMeetingContext() {
    if (!contextTitle.trim()) return;
    setContextSaving(true);
    setContextSaveStatus("saving");
    setContextSaveError(null);
    try {
      const payload = { organizationId, title: contextTitle, dateTime: contextDate || undefined, stakeholders: contextStakeholder ? [contextStakeholder] : [], domain: contextDomain || undefined, startsAt: contextDate || undefined, stakeholderName: contextStakeholder, domainName: contextDomain, objectives: contextObjectives, agendaItems: contextAgenda.split("\n").map((item) => item.trim()).filter(Boolean), desiredOutcome: contextOutcome };
      const res = await fetch(meetingContextId ? `/api/meeting-contexts/${meetingContextId}` : "/api/meeting-contexts", { method: meetingContextId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await readErrorMessage(res, "The meeting context could not be saved.")}`);
      }
      const context: MeetingContext = await res.json();
      setMeetingContextId(context.id);
      localStorage.removeItem(`flowstate-meeting-draft:${organizationId}`);
      setContextSaveStatus("saved");
      loadInputs();
    } catch (error) {
      setContextSaveStatus("error");
      setContextSaveError(error instanceof Error ? error.message : "The meeting context could not be saved. Please try again.");
    } finally {
      setContextSaving(false);
    }
  }

  function handleTypeChange(next: CapturedInputType) {
    setType(next);
    setRawText("");
    setFile(null);
    setFileError(null);
    setSubmitError(null);
    setCaptureSubmitted(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isFileType ? !file || !!fileError : !rawText.trim()) return;
    setSubmitError(null);
    setCaptureSubmitted(false);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("organizationId", organizationId);
      formData.append("type", type);
      if (locationTag) formData.append("locationTag", locationTag);
      if (meetingContextId) formData.append("meetingContextId", meetingContextId);
      if (isFileType) {
        formData.append("file", file as File);
      } else {
        formData.append("rawText", rawText);
      }

      const res = await fetch("/api/captured-inputs", { method: "POST", body: formData });
      if (res.ok) {
        setRawText("");
        setFile(null);
        setFileError(null);
        setCaptureSubmitted(true);
        loadInputs();
      } else {
        setSubmitError(await readErrorMessage(res));
      }
    } catch {
      if (!isFileType && rawText.trim()) {
        const key = `flowstate-offline-captures:${organizationId}`;
        const queued = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<{ type: CapturedInputType; rawText: string; meetingContextId?: string }>;
        queued.push({ type, rawText, meetingContextId: meetingContextId || undefined });
        localStorage.setItem(key, JSON.stringify(queued));
        setSubmitError("You are offline. This note is saved on this device and will sync when connectivity returns.");
      } else {
        setSubmitError("Capture could not be submitted. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function startLiveSession() {
    setStartingSession(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (res.ok) {
        const session = await res.json();
        router.push(`/clients/${organizationId}/session/${session.id}`);
      }
    } finally {
      setStartingSession(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href={`/clients/${organizationId}`} className="text-sm text-[var(--muted)]">
          &larr; Back to client
        </Link>
        <button
          onClick={startLiveSession}
          disabled={startingSession}
          className="text-xs font-medium px-3 py-1 rounded flowstate-accent-button text-white disabled:opacity-50"
        >
          {startingSession ? "Starting…" : "Start Live Session"}
        </button>
      </div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Capture</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Add evidence, then review extracted tags before using it in an assessment.</p>
        </div>
        <Link href={`/clients/${organizationId}/review`} className="flowstate-accent-button rounded px-3 py-2 text-sm font-medium text-white">
          Review extracted tags{statusCounts.needsReview > 0 ? ` (${statusCounts.needsReview})` : ""}
        </Link>
      </div>

      <section className="workspace-card mb-6 p-4" aria-labelledby="meeting-context-title">
        <h2 id="meeting-context-title" className="text-sm font-semibold text-[var(--foreground)]">Meeting agenda (optional)</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">Optional context keeps raw captures grouped. Save it now or capture first and complete it later.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input aria-label="Meeting title" value={contextTitle} onChange={(e) => setContextTitle(e.target.value)} placeholder="Meeting title" className="border border-[var(--card-border)] rounded px-2 py-2 text-sm" />
          <input aria-label="Meeting date and time" type="datetime-local" value={contextDate} onChange={(e) => setContextDate(e.target.value)} className="border border-[var(--card-border)] rounded px-2 py-2 text-sm" />
          <input aria-label="Stakeholder" value={contextStakeholder} onChange={(e) => setContextStakeholder(e.target.value)} placeholder="Stakeholder" className="border border-[var(--card-border)] rounded px-2 py-2 text-sm" />
          <select aria-label="Domain" value={contextDomain} onChange={(e) => setContextDomain(e.target.value)} className="border border-[var(--card-border)] rounded px-2 py-2 text-sm"><option value="">Select domain</option>{["Operations", "Financial and Legal", "People", "Technology and Data", "Customers and Revenue"].map((domain) => <option key={domain}>{domain}</option>)}</select>
          <textarea aria-label="Objectives" value={contextObjectives} onChange={(e) => setContextObjectives(e.target.value)} placeholder="Objectives" rows={2} className="border border-[var(--card-border)] rounded px-2 py-2 text-sm sm:col-span-2" />
          <textarea aria-label="Agenda items" value={contextAgenda} onChange={(e) => setContextAgenda(e.target.value)} placeholder="Agenda items (one per line)" rows={3} className="border border-[var(--card-border)] rounded px-2 py-2 text-sm" />
          <textarea aria-label="Desired outcome" value={contextOutcome} onChange={(e) => setContextOutcome(e.target.value)} placeholder="Desired outcome" rows={3} className="border border-[var(--card-border)] rounded px-2 py-2 text-sm" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" onClick={saveMeetingContext} disabled={contextSaving || !contextTitle.trim()} className="flowstate-accent-button rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{contextSaving ? "Saving…" : meetingContextId ? "Update meeting context" : "Save meeting context"}</button><Link href={`/clients/${organizationId}/scratchpad`} className="rounded border border-[var(--card-border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:border-[var(--accent)]">Open Meeting Scratch Pad</Link><span role="status" aria-live="polite" className="text-xs text-[var(--muted)]">{contextSaveStatus === "saving" ? "Meeting context is being saved…" : contextSaveStatus === "saved" ? "Meeting context saved and stored in Meeting Context." : contextSaveStatus === "error" ? `Meeting context could not be saved: ${contextSaveError}` : "Draft recovery is on for this browser; captures remain queued offline until connectivity returns."}</span></div>
      </section>

      <section className="workspace-card mb-6 p-4" aria-labelledby="capture-status-title">
        <h2 id="capture-status-title" className="text-sm font-semibold text-[var(--foreground)]">Capture status</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded border border-[var(--card-border)] bg-[var(--muted-bg)] p-3">
            <div className="text-lg font-semibold text-[var(--foreground)]">{statusCounts.needsReview}</div>
            <div className="text-xs text-[var(--muted)]">Needs review</div>
          </div>
          <div className="rounded border border-[var(--card-border)] bg-[var(--muted-bg)] p-3">
            <div className="text-lg font-semibold text-[var(--foreground)]">{statusCounts.processing}</div>
            <div className="text-xs text-[var(--muted)]">Processing</div>
          </div>
          <div className="rounded border border-[var(--card-border)] bg-[var(--muted-bg)] p-3">
            <div className="text-lg font-semibold text-[var(--foreground)]">{statusCounts.failed}</div>
            <div className="text-xs text-[var(--muted)]">Failed</div>
          </div>
        </div>
      </section>

      <section className="workspace-card mb-6 p-4" aria-labelledby="inbound-email-title">
        <h2 id="inbound-email-title" className="text-sm font-semibold text-[var(--foreground)]">Inbound email capture</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">Provider-neutral foundation. Configure Microsoft 365/Graph, SendGrid, or another provider separately; no provider credentials are stored here.</p>
        {inboundEmail ? <p className="mt-3 rounded border border-[var(--card-border)] bg-[var(--muted-bg)] p-3 text-sm"><span className="font-medium">Client address:</span> <code>{inboundEmail.inboundAddress}</code></p> : <p className="mt-3 text-sm text-[var(--muted)]">No inbound address configured yet.</p>}
        <button type="button" disabled={inboundEmailLoading} onClick={async () => { setInboundEmailLoading(true); const res = await fetch(`/api/clients/${organizationId}/inbound-email`, { method: "POST" }); if (res.ok) { const data = await res.json(); setInboundEmail(data); } setInboundEmailLoading(false); }} className="mt-3 flowstate-accent-button rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{inboundEmailLoading ? "Generating…" : inboundEmail ? "Rotate inbound address" : "Generate inbound address"}</button>
      </section>

      <form onSubmit={handleSubmit} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 mb-8">
        <div className="mb-4">
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as CapturedInputType)}
            className="border border-[var(--card-border)] rounded px-2 py-1 text-sm"
          >
            <option value="TEXT_NOTE">Text Note</option>
            <option value="EMAIL">Email</option>
            <option value="AUDIO">Audio</option>
            <option value="DOCUMENT">Document</option>
            <option value="DATA_ROOM_FILE">Data Room File</option>
          </select>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">Location (optional)</label>
          <input
            type="text"
            value={locationTag}
            onChange={(e) => setLocationTag(e.target.value)}
            placeholder="e.g. Alexandria, Brampton"
            className="border border-[var(--card-border)] rounded px-2 py-1 text-sm w-full"
          />
        </div>
        {isFileType ? (
          <div className="mb-4">
            <span className="block text-xs font-medium text-[var(--muted)] mb-1">Evidence file</span>
            <label
              htmlFor="capture-file"
              className="inline-flex cursor-pointer items-center rounded border border-[var(--card-border)] bg-[var(--muted-bg)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]"
            >
              {chooserLabels[type as "AUDIO" | "DOCUMENT" | "DATA_ROOM_FILE"]}
            </label>
            <input
              ref={fileInputRef}
              id="capture-file"
              type="file"
              accept={type === "AUDIO" ? "audio/*" : ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
              aria-describedby={type === "DOCUMENT" ? "document-file-help document-file-error" : undefined}
              aria-invalid={type === "DOCUMENT" && !!fileError}
              onChange={(e) => {
                const nextFile = e.target.files?.[0] ?? null;
                setFile(nextFile);
                setFileError(type === "DOCUMENT" ? validateDocumentFile(nextFile) : null);
                setSubmitError(null);
              }}
              className="sr-only"
            />
            {file && <p className="mt-2 text-sm text-[var(--foreground)]" aria-live="polite">Selected file: {file.name}</p>}
            {type === "DOCUMENT" && (
              <p id="document-file-help" className="text-xs text-[var(--muted)] mt-1">Select a PDF or DOCX document. Other file types are not accepted.</p>
            )}
            {type === "DOCUMENT" && fileError && <p id="document-file-error" role="alert" className="text-xs text-red-700 mt-1">{fileError}</p>}
          </div>
        ) : (
          <div className="mb-4">
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">
              {type === "EMAIL" ? "Email content (sender, subject, body)" : "Note"}
            </label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={8}
              className="border border-[var(--card-border)] rounded px-2 py-1 text-sm w-full"
            />
          </div>
        )}
        {submitting && <p role="status" aria-live="polite" className="text-sm text-[var(--muted)] mb-2">{type === "DOCUMENT" ? "Document upload in progress…" : "Capture in progress…"}</p>}
        {submitError && <p role="alert" className="text-sm text-red-700 mb-2">{submitError}</p>}
        <button
          type="submit"
          disabled={submitting || (isFileType ? !file || !!fileError : !rawText.trim())}
          className="flowstate-accent-button text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50"
        >
          {submitting ? "Submitting…" : isFileType ? actionLabels[type as "AUDIO" | "DOCUMENT" | "DATA_ROOM_FILE"] : "Capture"}
        </button>
      </form>

      {captureSubmitted && (
        <div role="status" aria-live="polite" className="mb-8 rounded-lg border border-[var(--card-border)] bg-[var(--muted-bg)] p-4">
          <p className="font-medium text-[var(--foreground)]">Capture submitted</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Review the extracted tags before they are used in assessment or planning.</p>
          <Link href={`/clients/${organizationId}/review`} className="mt-3 inline-flex text-sm font-medium text-[var(--accent)] underline underline-offset-2">
            Review captured evidence →
          </Link>
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3">Recent captures</h2>
      <div className="space-y-2">
        {inputs.map((input) => (
          <div
            key={input.id}
            className="flex items-center justify-between bg-[var(--card)] border border-[var(--card-border)] rounded px-3 py-2 text-sm"
          >
            <span>{input.type}</span>
            <span className="text-[var(--muted)]">{new Date(input.createdAt).toLocaleString()}</span>
            <StatusPill status={input.status} error={input.error} />
          </div>
        ))}
        {inputs.length === 0 && <p className="text-sm text-[var(--muted)]">No captures yet.</p>}
      </div>
    </div>
  );
}

async function readErrorMessage(response: Response, fallback = "Capture could not be submitted. Please try again.") {
  const body = await response.text();
  if (!body) return fallback;
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "object" && parsed !== null && "error" in parsed && typeof parsed.error === "string") {
      return parsed.error;
    }
  } catch {
    // Some runtime failures return plain text instead of JSON.
  }
  return body;
}

function StatusPill({ status, error }: { status: string; error: string | null }) {
  const background = status === "TAGGED" ? "#bbf7d0" : status === "FAILED" ? "#fee2e2" : "#fef9c3";
  const color = status === "TAGGED" ? "#14532d" : status === "FAILED" ? "#991b1b" : "#854d0e";
  return (
    <span className="score-pill text-xs font-bold" style={{ background, color }} title={error ?? undefined}>
      {status}
    </span>
  );
}
