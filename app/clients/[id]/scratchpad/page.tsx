"use client";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { plainTextToRichText, sanitizeRichText } from "@/lib/scratchpad/rich-text";
import { createScratchpadSaveQueue, type ScratchpadSavePayload } from "@/lib/scratchpad/save-queue";

type Context = { id: string; title: string; startsAt: string | null; objectives: string | null; agendaItems: string[]; desiredOutcome: string | null };
type Note = { id: string; rawText: string | null; revision: number; meetingContextId: string | null };
type Queue = ReturnType<typeof createScratchpadSaveQueue>;

export default function ScratchpadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const [html, setHtml] = useState("");
  const [contexts, setContexts] = useState<Context[]>([]);
  const [contextId, setContextId] = useState("");
  const [status, setStatus] = useState("Saved");
  const noteRef = useRef<Note | null>(null);
  const contextRef = useRef("");
  const queueRef = useRef<Queue | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cacheKey = `flowstate-scratchpad-${organizationId}`;

  const applyNote = (saved: Note) => { noteRef.current = saved; };
  useEffect(() => { contextRef.current = contextId; }, [contextId]);

  useEffect(() => {
    let active = true;
    const cached = localStorage.getItem(cacheKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) setHtml(sanitizeRichText(cached));
    const save = async (payload: ScratchpadSavePayload) => {
      const current = noteRef.current;
      const body = current ? { id: current.id, text: payload.text, revision: payload.revision, contextId: contextRef.current || null } : { organizationId, text: payload.text, contextId: contextRef.current || null };
      const res = await fetch("/api/scratchpad", { method: current ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 409) return { kind: "conflict" as const };
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      const saved = await res.json() as Note;
      if (active) applyNote(saved);
      return { kind: "saved" as const, revision: saved.revision };
    };
    const reload = async () => {
      const res = await fetch(`/api/scratchpad?organizationId=${organizationId}`);
      if (!res.ok) throw new Error("Could not reload scratch pad");
      const rows = await res.json() as Note[];
      if (!rows[0]) throw new Error("Scratch pad note disappeared");
      if (active) applyNote(rows[0]);
      return { revision: rows[0].revision };
    };
    queueRef.current = createScratchpadSaveQueue(save, reload, next => setStatus(next));
    fetch(`/api/scratchpad?organizationId=${organizationId}`).then(r => r.ok ? r.json() : []).then((rows: Note[]) => {
      if (!active || !rows[0]) return;
      applyNote(rows[0]);
      if (!cached) setHtml(plainTextToRichText(rows[0].rawText ?? ""));
      if (rows[0].meetingContextId) { setContextId(rows[0].meetingContextId); contextRef.current = rows[0].meetingContextId; }
    });
    fetch(`/api/meeting-contexts?organizationId=${organizationId}`).then(r => r.ok ? r.json() : []).then((value: Context[]) => { if (active) setContexts(Array.isArray(value) ? value : []); });
    return () => { active = false; if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [cacheKey, organizationId]);

  function enqueue(next: string) {
    const safe = sanitizeRichText(next);
    setHtml(safe);
    localStorage.setItem(cacheKey, safe);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => queueRef.current?.enqueue({ text: safe, revision: noteRef.current?.revision ?? 0, contextId: contextRef.current || null }), 400);
  }
  function format(command: "bold" | "underline") { document.execCommand(command); const editor = document.querySelector<HTMLElement>("[data-scratchpad-editor]"); if (editor) enqueue(editor.innerHTML); }

  return <main className="mx-auto max-w-4xl p-4 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><Link href={`/clients/${organizationId}/capture`} className="text-sm text-[var(--muted)]">← Capture Evidence</Link><h1 className="mt-2 text-2xl font-bold">Meeting Day Scratch Pad</h1><p className="text-sm text-[var(--muted)]">Fast, freeform capture. Notes remain raw and reviewable.</p></div><span role="status" className="rounded-full border border-[var(--card-border)] px-3 py-1 text-xs">{status}</span></div><section className="workspace-card mb-4 p-4"><h2 className="font-semibold">Meeting context <span className="text-xs font-normal text-[var(--muted)]">(optional)</span></h2><select aria-label="Meeting context" value={contextId} onChange={e => { setContextId(e.target.value); contextRef.current = e.target.value; enqueue(html); }} className="mt-2 w-full rounded border border-[var(--card-border)] bg-transparent p-2"><option value="">No context / start capturing now</option>{contexts.map(c => <option key={c.id} value={c.id}>{c.title || new Date(c.startsAt ?? "").toLocaleString()}</option>)}</select></section><section className="workspace-card p-4"><div className="mb-2 flex gap-2"><button type="button" onClick={() => format("bold")} className="rounded border px-2 py-1 text-sm"><strong>Bold</strong></button><button type="button" onClick={() => format("underline")} className="rounded border px-2 py-1 text-sm"><u>Underline</u></button><button type="button" disabled className="rounded border px-2 py-1 text-sm opacity-60" title="Audio storage is not configured">Voice unavailable</button></div><div aria-label="Scratch pad note" data-scratchpad-editor contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: html }} onInput={e => enqueue(e.currentTarget.innerHTML)} role="textbox" aria-multiline="true" className="min-h-[24rem] w-full resize-y overflow-auto rounded border border-[var(--card-border)] bg-transparent p-3 outline-none" data-placeholder="Type or paste notes…" /></section></main>;
}
