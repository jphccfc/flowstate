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
};

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
  }, [organizationId]);

  useEffect(() => {
    // Remote capture polling intentionally updates state after each fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInputs();
    fetch(`/api/clients/${organizationId}/inbound-email`).then((res) => res.ok ? res.json() : null).then(setInboundEmail);
    const interval = setInterval(loadInputs, 3000);
    return () => clearInterval(interval);
  }, [loadInputs, organizationId]);

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
      setSubmitError("Capture could not be submitted. Please try again.");
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

async function readErrorMessage(response: Response) {
  const fallback = "Capture could not be submitted. Please try again.";
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
