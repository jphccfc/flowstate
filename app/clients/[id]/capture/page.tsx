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
  const [selectedCaptureId, setSelectedCaptureId] = useState("");

  const isFileType = FILE_TYPES.has(type);
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
    const captureId = new URLSearchParams(window.location.search).get("captureId") ?? "";
    // The query string is an external navigation input for this read-only marker.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedCaptureId(captureId);
  }, []);

  useEffect(() => {
    // Remote capture polling intentionally updates state after each fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInputs();
    const interval = setInterval(loadInputs, 3000);
    return () => clearInterval(interval);
  }, [loadInputs]);

  function handleTypeChange(next: CapturedInputType) {
    setType(next);
    setRawText("");
    setFile(null);
    setFileError(null);
    setSubmitError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isFileType ? !file || !!fileError : !rawText.trim()) return;
    setSubmitError(null);
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
      <h1 className="text-2xl font-bold mb-6">Capture</h1>

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

      <h2 className="text-lg font-semibold mb-3">Recent captures</h2>
      <div className="space-y-2">
        {inputs.map((input) => (
          <div
            key={input.id}
            className={`flex items-center justify-between bg-[var(--card)] border border-[var(--card-border)] rounded px-3 py-2 text-sm ${selectedCaptureId === input.id ? "ring-2 ring-[var(--accent)]" : ""}`}
            aria-current={selectedCaptureId === input.id ? "location" : undefined}
          >
            <span>{selectedCaptureId === input.id ? "Referenced capture · " : ""}{input.type}</span>
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
