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
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [contextId, setContextId] = useState(requestedContextId);
  const [status, setStatus] = useState("Saved");
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<Note | null>(null);
  const notesRef = useRef<Note[]>([]);
  const contextRef = useRef(requestedContextId);
  const queueRef = useRef<Queue | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const dirtyRef = useRef(false);
  const loadedRef = useRef(false);
  const draftRef = useRef<string | null>(null);
  const composingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cacheBase = `flowstate-scratchpad-${organizationId}${requestedSessionId ? `-session-${requestedSessionId}` : ""}`;
  const cacheKeyFor = (id: string | null) => `${cacheBase}-${id ?? "new"}`;

  const setNoteCollection = (next: Note[]) => { notesRef.current = next; setNotes(next); };
  const applyNote = (saved: Note | null) => { noteRef.current = saved; setActiveNoteId(saved?.id ?? null); setContextId(saved?.meetingContextId ?? requestedContextId); contextRef.current = saved?.meetingContextId ?? requestedContextId; };
  const reconcile = (next: string) => {
    if (!canReconcileEditor({ dirty: dirtyRef.current, composing: composingRef.current })) return;
    if (editorRef.current && editorRef.current.innerHTML !== next) editorRef.current.innerHTML = next;
  };
  const showNote = (saved: Note | null) => {
    applyNote(saved);
    dirtyRef.current = false;
    draftRef.current = null;
    if (!saved) {
      localStorage.removeItem(cacheKeyFor(null));
      setContextId("");
      contextRef.current = "";
    }
    if (editorRef.current) editorRef.current.innerHTML = saved ? plainTextToRichText(saved.rawText ?? "") : "";
    const cached = saved ? localStorage.getItem(cacheKeyFor(saved.id)) : null;
    if (cached) reconcile(sanitizeRichText(cached));
  };
  const updateNote = (saved: Note) => {
    const next = notesRef.current.some(note => note.id === saved.id)
      ? notesRef.current.map(note => note.id === saved.id ? saved : note)
      : [saved, ...notesRef.current];
    setNoteCollection(next);
    noteRef.current = saved;
    setActiveNoteId(saved.id);
    setContextId(saved.meetingContextId ?? "");
    contextRef.current = saved.meetingContextId ?? "";
  };

  useLayoutEffect(() => {
    if (!dirtyRef.current) {
      const cached = localStorage.getItem(cacheKeyFor(activeNoteId));
      if (cached) reconcile(sanitizeRichText(cached));
    }
  }, [activeNoteId]);

  useEffect(() => {
    let active = true;
    const save = async (payload: ScratchpadSavePayload) => {
      const current = noteRef.current;
      const body = current
        ? { id: current.id, text: payload.text, revision: payload.revision, contextId: payload.contextId ?? null, sessionId: current.sessionId ?? (requestedSessionId || null) }
        : { organizationId, text: payload.text, contextId: payload.contextId ?? null, sessionId: requestedSessionId || null };
      const res = await fetch("/api/scratchpad", { method: current ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 409) return { kind: "conflict" as const };
      if (!res.ok) {
        const result = await res.json().catch(() => ({})) as { error?: unknown };
        throw new Error(`Save failed: ${typeof result.error === "string" ? result.error : res.status}`);
      }
      const saved = await res.json() as Note;
      if (active) { updateNote(saved); setError(null); }
      return { kind: "saved" as const, revision: saved.revision };
    };
    const reload = async () => {
      const scratchpadQuery = `/api/scratchpad?organizationId=${encodeURIComponent(organizationId)}${requestedSessionId ? `&sessionId=${encodeURIComponent(requestedSessionId)}` : ""}`;
      const res = await fetch(scratchpadQuery);
      if (!res.ok) throw new Error(`Could not reload scratch pad (${res.status})`);
      const rows = await res.json() as Note[];
      setNoteCollection(rows);
      const current = rows.find(row => row.id === noteRef.current?.id) ?? rows[0] ?? null;
      if (active && current) { noteRef.current = current; setActiveNoteId(current.id); setContextId(current.meetingContextId ?? ""); contextRef.current = current.meetingContextId ?? ""; }
      if (!current) throw new Error("Scratch pad note disappeared");
      return { revision: current.revision };
    };
    queueRef.current = createScratchpadSaveQueue(save, reload, next => setStatus(next), message => { if (active) setError(message); });
    const scratchpadQuery = `/api/scratchpad?organizationId=${encodeURIComponent(organizationId)}${requestedSessionId ? `&sessionId=${encodeURIComponent(requestedSessionId)}` : ""}`;
    fetch(scratchpadQuery).then(async response => {
      if (!response.ok) throw new Error(`Could not load Scratch Pad (${response.status})`);
      return await response.json() as Note[];
    }).then(rows => {
      if (!active) return;
      setNoteCollection(rows);
      const selected = rows[0] ?? null;
      showNote(selected);
      if (requestedContextId && selected) { setContextId(requestedContextId); contextRef.current = requestedContextId; }
      loadedRef.current = true;
    }).catch(cause => { if (active) { setError(`${cause instanceof Error ? cause.message : "Could not load Scratch Pad"}. Scratch Pad draft remains saved on this device.`); loadedRef.current = true; } });
    fetch(`/api/meeting-contexts?organizationId=${organizationId}`).then(r => r.ok ? r.json() : []).then((value: Context[]) => { if (active) setContexts(Array.isArray(value) ? value : []); });
    return () => { active = false; if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [organizationId, requestedContextId, requestedSessionId]);

  function enqueue(next: string) {
    dirtyRef.current = true;
    const safe = sanitizeRichText(next);
    draftRef.current = safe;
    localStorage.setItem(cacheKeyFor(noteRef.current?.id ?? null), safe);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (loadedRef.current) queueRef.current?.enqueue({ text: safe, revision: noteRef.current?.revision ?? 0, contextId: contextRef.current || null });
    }, 400);
  }
  async function activate(saved: Note | null) {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = undefined; }
    if (dirtyRef.current && draftRef.current !== null) queueRef.current?.enqueue({ text: draftRef.current, revision: noteRef.current?.revision ?? 0, contextId: contextRef.current || null });
    await queueRef.current?.flush();
    showNote(saved);
    setError(null);
  }
  async function createNewNote() { await activate(null); }
  async function deleteNote(note: Note) {
    if (!window.confirm("Delete this Scratch Pad note permanently?")) return;
    setError(null);
    const res = await fetch(`/api/scratchpad?id=${encodeURIComponent(note.id)}`, { method: "DELETE" });
    if (!res.ok) {
      const result = await res.json().catch(() => ({})) as { error?: unknown };
      setError(`Delete failed: ${typeof result.error === "string" ? result.error : res.status}`);
      return;
    }
    localStorage.removeItem(cacheKeyFor(note.id));
    const remaining = notesRef.current.filter(item => item.id !== note.id);
    setNoteCollection(remaining);
    if (note.id === noteRef.current?.id) showNote(remaining[0] ?? null);
  }

  function format(command: "bold" | "underline") { editorRef.current?.focus(); document.execCommand(command); if (editorRef.current) enqueue(editorRef.current.innerHTML); }
  const activeNote = notes.find(note => note.id === activeNoteId) ?? null;

  return <main className="mx-auto max-w-4xl p-4 sm:p-6">
    <div className="mb-5 flex items-start justify-between gap-4"><div><Link href={`/clients/${organizationId}/capture`} className="text-sm text-[var(--muted)]">← Capture Evidence</Link><h1 className="mt-2 text-2xl font-bold">Meeting Day Scratch Pad</h1><p className="text-sm text-[var(--muted)]">Fast, freeform capture. Create as many independent notes as you need.</p><Link href={`/clients/${organizationId}/review`} className="mt-2 inline-block text-sm text-[var(--accent)] underline">Review Scratch Pad notes</Link></div><div className="flex items-center gap-2"><button type="button" onClick={() => void createNewNote()} className="rounded border border-[var(--accent)] px-3 py-2 text-sm font-medium">New note</button><span role="status" className="rounded-full border border-[var(--card-border)] px-3 py-1 text-xs">{status}</span></div></div>
    {error && <div role="alert" className="mb-4 rounded border border-[var(--destructive)] p-3 text-sm text-[var(--destructive)]">{error}</div>}
    {notes.length > 0 && <section aria-label="Scratch Pad notes" className="workspace-card mb-4 p-3"><div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Notes</h2><span className="text-xs text-[var(--muted)]">{notes.length} note{notes.length === 1 ? "" : "s"}</span></div><div className="grid gap-2 sm:grid-cols-2">{notes.map(note => <div key={note.id} className="flex items-start gap-2"><button type="button" onClick={() => void activate(note)} className={`min-w-0 flex-1 rounded border p-3 text-left ${note.id === activeNoteId ? "border-[var(--accent)]" : "border-[var(--card-border)]"}`}><span className="block truncate text-sm">{(note.rawText ?? "Untitled note").replace(/<[^>]+>/g, "") || "Untitled note"}</span><span className="mt-1 block text-xs text-[var(--muted)]">{note.meetingContextId ? contexts.find(context => context.id === note.meetingContextId)?.title ?? "Assigned context" : "No context"} · {new Date(note.updatedAt).toLocaleString()}</span></button><button type="button" aria-label={`Delete Scratch Pad note ${note.id}`} onClick={() => void deleteNote(note)} className="rounded border border-[var(--destructive)] px-2 py-1 text-xs text-[var(--destructive)]">Delete</button></div>)}</div></section>}
    <section className="workspace-card mb-4 p-4"><h2 className="font-semibold">Meeting context <span className="text-xs font-normal text-[var(--muted)]">(optional, applies to this note only)</span></h2><select aria-label="Meeting context" value={contextId} onChange={event => { setContextId(event.target.value); contextRef.current = event.target.value; enqueue(editorRef.current?.innerHTML ?? ""); }} className="mt-2 w-full rounded border border-[var(--card-border)] bg-transparent p-2"><option value="">No context / start capturing now</option>{contexts.map(context => <option key={context.id} value={context.id}>{context.title || new Date(context.startsAt ?? "").toLocaleString()}</option>)}</select>{contextId && <div className="mt-3 rounded border border-[var(--card-border)] bg-[var(--muted-bg)] p-3 text-sm"><p className="font-medium">Selected agenda context</p>{contexts.find(context => context.id === contextId)?.title && <p className="mt-1">{contexts.find(context => context.id === contextId)?.title}</p>}</div>}</section>
    <section className="workspace-card p-4"><div className="mb-2 flex gap-2"><button type="button" onClick={() => format("bold")} className="rounded border px-2 py-1 text-sm"><strong>Bold</strong></button><button type="button" onClick={() => format("underline")} className="rounded border px-2 py-1 text-sm"><u>Underline</u></button><button type="button" disabled className="rounded border px-2 py-1 text-sm opacity-60" title="Audio storage is not configured">Voice unavailable</button></div><div ref={editorRef} aria-label="Scratch pad note" data-scratchpad-editor contentEditable suppressContentEditableWarning onCompositionStart={() => { composingRef.current = true; }} onCompositionEnd={() => { composingRef.current = false; enqueue(editorRef.current?.innerHTML ?? ""); }} onInput={event => enqueue(event.currentTarget.innerHTML)} role="textbox" aria-multiline="true" className="min-h-[24rem] w-full resize-y overflow-auto rounded border border-[var(--card-border)] bg-transparent p-3 outline-none" data-placeholder={activeNote ? "Continue this note…" : "Type a new note…"} /></section>
  </main>;
}
