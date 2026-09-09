"use client";
import { use, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { plainTextToRichText, sanitizeRichText } from "@/lib/scratchpad/rich-text";
import { canReconcileEditor } from "@/lib/scratchpad/editor-sync";
import { createScratchpadSaveQueue, type ScratchpadSavePayload } from "@/lib/scratchpad/save-queue";

type Context = { id: string; title: string; startsAt: string | null; objectives: string | null; agendaItems: string[]; desiredOutcome: string | null };
type Note = { id: string; rawText: string | null; revision: number; meetingContextId: string | null; sessionId: string | null; updatedAt: string; senderName: string | null; senderEmail: string | null };
type Queue = ReturnType<typeof createScratchpadSaveQueue>;

export default function ScratchpadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const searchParams = useSearchParams();
  const requestedContextId = searchParams.get("contextId") ?? "";
  const requestedSessionId = searchParams.get("sessionId") ?? "";

  const [contexts, setContexts] = useState<Context[]>([]);
  const [contextId, setContextId] = useState(requestedContextId);
  const [status, setStatus] = useState("Saved");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const noteRef = useRef<Note | null>(null);
  const contextRef = useRef(requestedContextId);
  const queueRef = useRef<Queue | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const dirtyRef = useRef(false);
  const loadedRef = useRef(false);
  const draftRef = useRef<string | null>(null);
  const composingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cacheKey = `flowstate-scratchpad-${organizationId}${requestedSessionId ? `-session-${requestedSessionId}` : ""}`;

  const applyNote = (saved: Note) => { noteRef.current = saved; setNote(saved); };
  const reconcile = (next: string) => {
    if (!canReconcileEditor({ dirty: dirtyRef.current, composing: composingRef.current })) return;
    if (editorRef.current && editorRef.current.innerHTML !== next) editorRef.current.innerHTML = next;
  };
  useLayoutEffect(() => { if (!dirtyRef.current) { const cached = localStorage.getItem(cacheKey); if (cached) reconcile(sanitizeRichText(cached)); } }, [note, cacheKey]);
  useEffect(() => { contextRef.current = contextId; }, [contextId]);

  useEffect(() => {
    let active = true;
    const cached = localStorage.getItem(cacheKey);
    if (cached) reconcile(sanitizeRichText(cached));
    const save = async (payload: ScratchpadSavePayload) => {
      const current = noteRef.current;
      const body = current ? { id: current.id, text: payload.text, revision: payload.revision, contextId: payload.contextId ?? null, sessionId: current.sessionId ?? (requestedSessionId || null) } : { organizationId, text: payload.text, contextId: payload.contextId ?? null, sessionId: requestedSessionId || null };
      const res = await fetch("/api/scratchpad", { method: current ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 409) return { kind: "conflict" as const };
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: unknown };
        const message = typeof body.error === "string" ? body.error : `Save failed: ${res.status}`;
        throw new Error(`Save failed: ${message}`);
      }
      const saved = await res.json() as Note;
      if (active) { applyNote(saved); setError(null); }
      return { kind: "saved" as const, revision: saved.revision };
    };
    const reload = async () => {
      const scratchpadQuery = `/api/scratchpad?organizationId=${encodeURIComponent(organizationId)}${requestedSessionId ? `&sessionId=${encodeURIComponent(requestedSessionId)}` : ""}`;
      const res = await fetch(scratchpadQuery);
      if (!res.ok) throw new Error(`Could not reload scratch pad (${res.status})`);
      const rows = await res.json() as Note[];
      if (!rows[0]) throw new Error("Scratch pad note disappeared");
      if (active) applyNote(rows[0]);
      return { revision: rows[0].revision };
    };
    queueRef.current = createScratchpadSaveQueue(save, reload, next => setStatus(next), message => { if (active) setError(message); });
    const scratchpadQuery = `/api/scratchpad?organizationId=${encodeURIComponent(organizationId)}${requestedSessionId ? `&sessionId=${encodeURIComponent(requestedSessionId)}` : ""}`;
    fetch(scratchpadQuery).then(async r => {
      if (!r.ok) throw new Error(`Could not load Scratch Pad (${r.status})`);
      return await r.json() as Note[];
    }).catch(cause => { if (active) setError(`${cause instanceof Error ? cause.message : "Could not load Scratch Pad"}. Scratch Pad draft remains saved on this device.`); return []; }).then((rows: Note[]) => {
      if (!active) return;
      if (rows[0]) {
        applyNote(rows[0]);
        if (!cached) reconcile(plainTextToRichText(rows[0].rawText ?? ""));
        const linkedContextId = requestedContextId;
        if (linkedContextId) { setContextId(linkedContextId); contextRef.current = linkedContextId; }
      }
      loadedRef.current = true;
      if (dirtyRef.current && draftRef.current) queueRef.current?.enqueue({ text: draftRef.current, revision: noteRef.current?.revision ?? 0, contextId: contextRef.current || null });
    });
    fetch(`/api/meeting-contexts?organizationId=${organizationId}`).then(r => r.ok ? r.json() : []).then((value: Context[]) => { if (active) setContexts(Array.isArray(value) ? value : []); });
    return () => { active = false; if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [cacheKey, organizationId, requestedContextId, requestedSessionId]);

  function enqueue(next: string) {
    dirtyRef.current = true;
    const safe = sanitizeRichText(next);
    draftRef.current = safe;
    localStorage.setItem(cacheKey, safe);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!loadedRef.current) return;
      queueRef.current?.enqueue({ text: safe, revision: noteRef.current?.revision ?? 0, contextId: contextRef.current || null });
    }, 400);
  }
  function format(command: "bold" | "underline") {
    editorRef.current?.focus();
    document.execCommand(command);
    if (editorRef.current) enqueue(editorRef.current.innerHTML);
  }

  return <main className="mx-auto max-w-4xl p-4 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><Link href={`/clients/${organizationId}/capture`} className="text-sm text-[var(--muted)]">← Capture Evidence</Link><h1 className="mt-2 text-2xl font-bold">Meeting Day Scratch Pad</h1><p className="text-sm text-[var(--muted)]">Fast, freeform capture. Notes remain raw and reviewable.</p>{note?.updatedAt && <p className="mt-2 text-sm text-[var(--muted)]">Updated at {new Date(note.updatedAt).toLocaleString()}{(note.senderName || note.senderEmail) && <> by {note.senderName || note.senderEmail}</>}</p>}<Link href={`/clients/${organizationId}/review`} className="mt-2 inline-block text-sm text-[var(--accent)] underline">Review Scratch Pad notes</Link></div>{error && <div role="alert" className="mb-4 rounded border border-[var(--destructive)] p-3 text-sm text-[var(--destructive)]">{error}</div>}<span role="status" className="rounded-full border border-[var(--card-border)] px-3 py-1 text-xs">{status}</span></div><section className="workspace-card mb-4 p-4"><h2 className="font-semibold">Meeting context <span className="text-xs font-normal text-[var(--muted)]">(optional)</span></h2><select aria-label="Meeting context" value={contextId} onChange={e => { setContextId(e.target.value); contextRef.current = e.target.value; enqueue(editorRef.current?.innerHTML ?? ""); }} className="mt-2 w-full rounded border border-[var(--card-border)] bg-transparent p-2"><option value="">No context / start capturing now</option>{contexts.map(c => <option key={c.id} value={c.id}>{c.title || new Date(c.startsAt ?? "").toLocaleString()}</option>)}</select>{contextId && <div className="mt-3 rounded border border-[var(--card-border)] bg-[var(--muted-bg)] p-3 text-sm" aria-live="polite"><p className="font-medium">Selected agenda context</p>{(() => { const selected = contexts.find(c => c.id === contextId); return selected ? <><p className="mt-1">{selected.title}</p>{selected.objectives && <p className="mt-1 text-[var(--muted)]">Objective: {selected.objectives}</p>}{selected.agendaItems.length > 0 && <p className="mt-1 text-[var(--muted)]">{selected.agendaItems.length} agenda item{selected.agendaItems.length === 1 ? "" : "s"}</p>}</> : <p className="mt-1 text-[var(--muted)]">Loading agenda details…</p>; })()}</div>}</section><section className="workspace-card p-4"><div className="mb-2 flex gap-2"><button type="button" onClick={() => format("bold")} className="rounded border px-2 py-1 text-sm"><strong>Bold</strong></button><button type="button" onClick={() => format("underline")} className="rounded border px-2 py-1 text-sm"><u>Underline</u></button><button type="button" disabled className="rounded border px-2 py-1 text-sm opacity-60" title="Audio storage is not configured">Voice unavailable</button></div><div ref={editorRef} aria-label="Scratch pad note" data-scratchpad-editor contentEditable suppressContentEditableWarning onCompositionStart={() => { composingRef.current = true; }} onCompositionEnd={() => { composingRef.current = false; enqueue(editorRef.current?.innerHTML ?? ""); }} onInput={e => enqueue(e.currentTarget.innerHTML)} role="textbox" aria-multiline="true" className="min-h-[24rem] w-full resize-y overflow-auto rounded border border-[var(--card-border)] bg-transparent p-3 outline-none" data-placeholder="Type or paste notes…" /></section></main>;
}
