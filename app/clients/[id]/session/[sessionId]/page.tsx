"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import Link from "next/link";
import { parseUploadResponse } from "@/lib/ingestion/upload-response";

type Tag = { id: string; targetType: string; targetId: string; status: string };
type Segment = { id: string; text: string; tags: Tag[] };
type CapturedInput = { id: string; type: string; rawText: string | null; status: string; error: string | null; segments: Segment[]; createdAt: string };
type Session = { id: string; status: string; organizationId: string; capturedInputs: CapturedInput[] };
type Suggestion = { id: string; suggestedQuestion: string };

export default function SessionPage({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id: organizationId, sessionId } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [noteText, setNoteText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [micStatus, setMicStatus] = useState<"unsupported" | "idle" | "requesting" | "ready" | "recording" | "paused" | "stopped" | "error">("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "uploaded" | "failed">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const loadSession = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (res.ok) setSession(await res.json());
  }, [sessionId]);

  const loadSuggestions = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/suggestions`);
    if (res.ok) setSuggestions(await res.json());
  }, [sessionId]);

  useEffect(() => {
    // Remote session polling intentionally updates state after each fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSession();
    loadSuggestions();
    const interval = setInterval(() => {
      loadSession();
      loadSuggestions();
    }, 3000);
    return () => clearInterval(interval);
  }, [loadSession, loadSuggestions]);

  const isActive = session?.status === "active";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("organizationId", organizationId);
      formData.append("type", "TEXT_NOTE");
      formData.append("rawText", noteText);
      formData.append("sessionId", sessionId);

      const res = await fetch("/api/captured-inputs", { method: "POST", body: formData });
      if (res.ok) {
        setNoteText("");
        loadSession();
      }
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const capabilityCheck = window.setTimeout(() => {
      if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") setMicStatus("unsupported");
    }, 0);
    return () => {
      window.clearTimeout(capabilityCheck);
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startRecording() {
    setMicError(null);
    setUploadError(null);
    setMicStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioBlob(blob);
        setMicStatus("stopped");
        stream.getTracks().forEach((track) => track.stop());
        void uploadAudio(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setMicStatus("recording");
    } catch (error) {
      setMicStatus("error");
      setMicError(error instanceof DOMException && error.name === "NotAllowedError" ? "Microphone permission was denied. Allow access in your browser settings and try again." : "Microphone could not be started. Please try again.");
    }
  }

  function pauseRecording() {
    if (mediaRecorderRef.current?.state === "recording") { mediaRecorderRef.current.pause(); setMicStatus("paused"); }
  }

  function resumeRecording() {
    if (mediaRecorderRef.current?.state === "paused") { mediaRecorderRef.current.resume(); setMicStatus("recording"); }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
  }

  async function uploadAudio(blob: Blob) {
    setUploadStatus("uploading");
    setUploadError(null);
    try {
      const extension = blob.type.includes("mp4") || blob.type.includes("aac") ? "m4a" : "webm";
      const formData = new FormData();
      formData.append("organizationId", organizationId);
      formData.append("type", "AUDIO");
      formData.append("sessionId", sessionId);
      formData.append("file", new File([blob], `live-session-${Date.now()}.${extension}`, { type: blob.type }));
      const res = await fetch("/api/captured-inputs", { method: "POST", body: formData });
      const result = await parseUploadResponse(res);
      if (!result.ok) throw new Error(result.error);
      setUploadStatus("uploaded");
      await loadSession();
    } catch (error) {
      setUploadStatus("failed");
      setUploadError(error instanceof Error ? error.message : "Audio upload failed. Please try again.");
    }
  }

  async function endSession() {
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end" }),
    });
    loadSession();
  }

  async function actOnSuggestion(id: string, action: "ask" | "dismiss") {
    await fetch(`/api/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }

  if (!session) return <div className="p-6 text-sm text-[var(--muted)]">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href={`/clients/${organizationId}/capture`} className="text-sm text-[var(--muted)]">
          &larr; Back to capture
        </Link>
        {isActive && (
          <button
            onClick={endSession}
            className="text-xs font-medium px-3 py-1 rounded bg-[var(--destructive)] text-white"
          >
            End Session
          </button>
        )}
      </div>
      <h1 className="text-2xl font-bold mb-2">Live Session</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Status: {session.status}
      </p>

      {suggestions.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Suggested follow-ups</h2>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between bg-[var(--card)] border border-[var(--card-border)] rounded px-3 py-2 text-sm"
              >
                <span>{s.suggestedQuestion}</span>
                {isActive && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => actOnSuggestion(s.id, "ask")}
                      className="text-xs font-medium px-2 py-1 rounded flowstate-accent-button text-white"
                    >
                      Ask
                    </button>
                    <button
                      onClick={() => actOnSuggestion(s.id, "dismiss")}
                      className="text-xs font-medium px-2 py-1 rounded bg-[var(--muted-bg)] text-[var(--muted)]"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isActive && (
        <section className="mb-6 rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4" aria-labelledby="microphone-title">
          <h2 id="microphone-title" className="text-lg font-semibold">Microphone capture</h2>
          <p className="mt-1 text-sm text-[var(--muted)]" role="status" aria-live="polite">Microphone permission: {micStatus === "requesting" ? "requesting access…" : micStatus}</p>
          {micError && <p role="alert" className="mt-2 text-sm text-red-700">{micError}</p>}
          {micStatus === "unsupported" && <p className="mt-2 text-sm text-[var(--muted)]">Live microphone recording is not supported in this browser. Use Chrome/Edge on laptop or a current Safari/Android browser.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {(micStatus === "idle" || micStatus === "error" || micStatus === "stopped") && <button type="button" onClick={startRecording} className="flowstate-accent-button rounded px-3 py-2 text-sm font-medium text-white">Start recording</button>}
            {micStatus === "recording" && <><button type="button" onClick={pauseRecording} className="rounded border border-[var(--card-border)] px-3 py-2 text-sm">Pause recording</button><button type="button" onClick={stopRecording} className="rounded bg-[var(--destructive)] px-3 py-2 text-sm text-white">Stop and save</button></>}
            {micStatus === "paused" && <><button type="button" onClick={resumeRecording} className="flowstate-accent-button rounded px-3 py-2 text-sm font-medium text-white">Resume recording</button><button type="button" onClick={stopRecording} className="rounded bg-[var(--destructive)] px-3 py-2 text-sm text-white">Stop and save</button></>}
          </div>
          {audioBlob && uploadStatus === "uploading" && <p className="mt-2 text-sm text-[var(--muted)]" role="status">Uploading audio and starting transcription…</p>}
          {uploadStatus === "uploaded" && <p className="mt-2 text-sm text-green-700" role="status">Audio saved. Transcription and tagging are processing below.</p>}
          {uploadStatus === "failed" && <div className="mt-2 flex flex-wrap items-center gap-2"><p role="alert" className="text-sm text-red-700">Audio upload failed: {uploadError}</p><button type="button" onClick={() => audioBlob && uploadAudio(audioBlob)} className="rounded border border-[var(--card-border)] px-3 py-1 text-sm">Retry upload</button></div>}
        </section>
      )}

      <div className="space-y-3 mb-6">
        {session.capturedInputs.map((input) => (
          <div key={input.id} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <p className="text-xs font-medium text-[var(--muted)]">{input.type === "AUDIO" ? "Recorded audio" : "Typed note"} · {input.status}</p><p className="text-sm mb-2">{input.rawText || (input.type === "AUDIO" ? "Transcription pending…" : "")}</p>{input.status === "FAILED" && <p role="alert" className="text-xs text-red-700">{input.error || "Processing failed"}</p>}
            <div className="flex flex-wrap gap-1">
              {input.segments.flatMap((seg) =>
                seg.tags.map((tag) => (
                  <span key={tag.id} className="score-pill text-xs" style={{ background: "#f1f5f9", color: "#64748b" }}>
                    {tag.targetType}
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
        {session.capturedInputs.length === 0 && (
          <p className="text-sm text-[var(--muted)]">No notes captured yet.</p>
        )}
      </div>

      {isActive && (
        <form onSubmit={handleSubmit} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            placeholder="Type what's being discussed…"
            className="border border-[var(--card-border)] rounded px-2 py-1 text-sm w-full mb-3"
          />
          <button
            type="submit"
            disabled={submitting || !noteText.trim()}
            className="flowstate-accent-button text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit note"}
          </button>
        </form>
      )}
    </div>
  );
}
