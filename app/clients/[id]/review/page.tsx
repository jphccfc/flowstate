"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import Link from "next/link";
import { sanitizeRichText } from "@/lib/scratchpad/rich-text";
import { displayDocumentName } from "@/lib/documents/display-name";

type Candidate = { id: string; name: string };
type DocumentTagGroup = { capturedInputId: string; filename: string; sourceRef: string | null; capturedAt: string; tags: PendingTag[] };

async function readErrorMessage(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: unknown };
  return typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
}

type ScratchpadNote = {
  id: string;
  rawText: string | null;
  revision: number;
  reviewStatus: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  status: string;
  updatedAt: string;
  meetingContext: { title: string | null; startsAt: string | null } | null;
};

type PendingTag = {
  id: string;
  targetType: string;
  targetId: string;
  targetName: string;
  confidence: number;
  segment: { text: string };
  provenance: {
    sourceType: string;
    sourceRef: string | null;
    locationTag: string | null;
    capturedAt: string;
    capturedInputId: string;
    segmentId: string;
    segmentText: string;
    aiConfidence: number;
    generatedAt: string;
  };
  decision: { status: string; reviewedBy: string | null; reviewedAt: string | null };
  candidates: Candidate[];
};

function ScratchpadNoteEditor({ note, onChange }: { note: ScratchpadNote; onChange: (html: string) => void }) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = sanitizeRichText(note.rawText ?? "");
  }, [note.id]);

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={`Edit Scratch Pad note ${note.id}`}
      onInput={(event) => onChange(event.currentTarget.innerHTML)}
      className="prose prose-sm max-w-none rounded border border-[var(--card-border)] p-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    />
  );
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const [tags, setTags] = useState<PendingTag[]>([]);
  const [scratchpadNotes, setScratchpadNotes] = useState<ScratchpadNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [tagQuery, setTagQuery] = useState("");
  const [tagSourceType, setTagSourceType] = useState("");
  const [appliedTagQuery, setAppliedTagQuery] = useState("");
  const [appliedTagSourceType, setAppliedTagSourceType] = useState("");
  const sanitizedRawText = (note: ScratchpadNote) => sanitizeRichText(note.rawText ?? "");
  const groupedTags = Array.from(tags.reduce((groups, tag) => {
    const key = tag.provenance.capturedInputId;
    const existing = groups.get(key);
    if (existing) existing.tags.push(tag);
    else groups.set(key, { capturedInputId: key, filename: displayDocumentName(tag.provenance.sourceRef), sourceRef: tag.provenance.sourceRef, capturedAt: tag.provenance.capturedAt, tags: [tag] });
    return groups;
  }, new Map<string, DocumentTagGroup>()).values());

  const loadReviewItems = useCallback(async () => {
    setError(null);
    const [tagsResult, notesResult] = await Promise.allSettled([
      fetch(`/api/tags?organizationId=${organizationId}${appliedTagQuery ? `&q=${encodeURIComponent(appliedTagQuery)}` : ""}${appliedTagSourceType ? `&sourceType=${encodeURIComponent(appliedTagSourceType)}` : ""}`),
      fetch(`/api/scratchpad?organizationId=${organizationId}`),
    ]);
    const errors: string[] = [];

    if (tagsResult.status === "fulfilled" && tagsResult.value.ok) {
      setTags(await tagsResult.value.json());
    } else {
      errors.push("AI tag suggestions could not be loaded.");
    }

    if (notesResult.status === "fulfilled" && notesResult.value.ok) {
      setScratchpadNotes(await notesResult.value.json());
    } else {
      const detail = notesResult.status === "fulfilled" ? await readErrorMessage(notesResult.value) : "network request failed";
      const status = notesResult.status === "fulfilled" ? `HTTP ${notesResult.value.status}` : "HTTP network";
      errors.push(`Scratch Pad notes could not be loaded (${status}): ${detail}`);
    }

    if (errors.length) setError(errors.join(" "));
    setLoading(false);
  }, [organizationId, appliedTagQuery, appliedTagSourceType]);

  useEffect(() => {
    // This call intentionally synchronizes the page with the remote review APIs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReviewItems();
  }, [loadReviewItems]);

  async function actDocument(group: DocumentTagGroup, action: "approve" | "reject") {
    setActionId(group.capturedInputId); setError(null);
    try {
      const res = await fetch("/api/tags/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, capturedInputId: group.capturedInputId, action }) });
      if (!res.ok) throw new Error("The document review decision could not be saved.");
      await loadReviewItems();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The document review decision could not be saved."); }
    finally { setActionId(null); }
  }

  async function saveNote(note: ScratchpadNote) {
    const text = noteDrafts[note.id];
    if (text === undefined) return;
    setActionId(note.id); setError(null);
    try {
      const res = await fetch("/api/scratchpad", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: note.id, text, revision: note.revision }) });
      if (!res.ok) throw new Error(res.status === 409 ? "This note changed elsewhere; refresh and try again." : "The note could not be saved.");
      await loadReviewItems();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The note could not be saved."); }
    finally { setActionId(null); }
  }

  async function reviewNote(note: ScratchpadNote, action: "approve" | "reject") {
    // API decisions are sent as { action: "approve" } or { action: "reject" }.

    if (!window.confirm(`Are you sure you want to ${action} this Scratch Pad note?`)) return;
    setActionId(note.id); setError(null);
    try {
      const res = await fetch("/api/scratchpad", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: note.id, action }) });
      if (!res.ok) {
        const detail = await readErrorMessage(res);
        throw new Error(`The note review decision could not be saved: ${detail}`);
      }
      await loadReviewItems();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The note review decision could not be saved."); }
    finally { setActionId(null); }
  }

  async function deleteNote(note: ScratchpadNote) {
    if (!window.confirm("Delete this Scratch Pad note permanently?")) return;
    setActionId(note.id); setError(null);
    try {
      const res = await fetch(`/api/scratchpad?id=${encodeURIComponent(note.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const detail = await readErrorMessage(res);
        throw new Error(`The note could not be deleted: ${detail}`);
      }
      setScratchpadNotes((prev) => prev.filter((item) => item.id !== note.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The note could not be deleted.");
    } finally {
      setActionId(null);
    }
  }


  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4">
        <Link href={`/clients/${organizationId}`} className="text-sm text-[var(--muted)]">
          &larr; Back to client
        </Link>
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Tag Review</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Detailed segment-level AI suggestions and Scratch Pad notes. For document-level analysis, use <Link href={`/clients/${organizationId}/findings`} className="underline decoration-dotted">Evidence review</Link>.</p>
        <Link href={`/clients/${organizationId}/scratchpad`} className="rounded px-3 py-2 text-sm font-medium text-white flowstate-accent-button">New Scratch Pad note</Link>
      </div>
      {error && <div role="alert" className="mb-4 rounded-lg border border-[var(--destructive)] p-3 text-sm text-[var(--destructive)]">{error}</div>}
      <form className="mb-6 grid gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 sm:grid-cols-[1fr_12rem_auto]" onSubmit={(event) => { event.preventDefault(); setAppliedTagQuery(tagQuery.trim()); setAppliedTagSourceType(tagSourceType); }}><label className="sr-only" htmlFor="tag-search">Search tags, meeting notes or documents</label><input id="tag-search" value={tagQuery} onChange={(event) => setTagQuery(event.target.value)} placeholder="Search tags, meeting notes or documents" className="rounded border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm" /><label className="text-xs text-[var(--muted)]">Source type<select aria-label="Source type" value={tagSourceType} onChange={(event) => setTagSourceType(event.target.value)} className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--card)] px-2 py-2 text-sm text-[var(--foreground)]"><option value="">All sources</option><option value="TEXT_NOTE">Meeting/text notes</option><option value="DOCUMENT">Documents</option><option value="EMAIL">Email</option><option value="AUDIO">Audio</option></select></label><button type="submit" className="self-end rounded px-3 py-2 text-sm font-medium text-white flowstate-accent-button">Apply filters</button></form>
      <section aria-labelledby="scratchpad-notes-heading" className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="scratchpad-notes-heading" className="text-lg font-semibold">Scratch Pad notes</h2>
          <span className="text-xs text-[var(--muted)]">Raw / provisional — not approved</span>
        </div>
        {scratchpadNotes.length === 0 ? <p className="text-sm text-[var(--muted)]">No Scratch Pad notes yet.</p> : (
          <div className="space-y-3">
            {scratchpadNotes.map((note) => (
              <article key={note.id} className="rounded-lg border border-[var(--card-border)] p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">{note.meetingContext?.title || (note.meetingContext?.startsAt ? new Date(note.meetingContext.startsAt).toLocaleString() : "Unlinked meeting")}</h3>
                  <span className="rounded-full border border-[var(--card-border)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">{note.reviewStatus} · raw</span>
                </div>
                <ScratchpadNoteEditor note={note} onChange={(html) => setNoteDrafts((prev) => ({ ...prev, [note.id]: html }))} />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[var(--muted)]">Updated {new Date(note.updatedAt).toLocaleString()}. Raw content stays visible during review.</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => saveNote(note)} disabled={actionId !== null || noteDrafts[note.id] === undefined} className="rounded border border-[var(--card-border)] px-3 py-1 text-xs font-medium disabled:opacity-50">Save edit</button>
                    <button type="button" onClick={() => reviewNote(note, "approve")} disabled={actionId !== null || note.reviewStatus !== "PENDING_REVIEW"} className="rounded px-3 py-1 text-xs font-medium text-white flowstate-success-button disabled:opacity-50">Approve</button>
                    <button type="button" onClick={() => reviewNote(note, "reject")} disabled={actionId !== null || note.reviewStatus !== "PENDING_REVIEW"} className="rounded bg-[var(--destructive)] px-3 py-1 text-xs font-medium text-white disabled:opacity-50">Reject</button>
                    <button type="button" onClick={() => void deleteNote(note)} disabled={actionId !== null} className="rounded border border-[var(--destructive)] px-3 py-1 text-xs font-medium text-[var(--destructive)] disabled:opacity-50">Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {groupedTags.length === 0 && <p className="text-sm text-[var(--muted)]">Nothing pending review.</p>}
      <div className="space-y-3">
        {groupedTags.map((group) => (
          <section key={group.capturedInputId} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{group.filename}</h2><p className="text-xs text-[var(--muted)]">{group.tags.length} supporting tag{group.tags.length === 1 ? "" : "s"} · captured {new Date(group.capturedAt).toLocaleString()}</p></div><div className="flex gap-2"><button type="button" onClick={() => void actDocument(group, "approve")} disabled={actionId !== null} className="rounded px-3 py-1.5 text-xs font-medium text-white flowstate-success-button disabled:opacity-50">Approve document</button><button type="button" onClick={() => void actDocument(group, "reject")} disabled={actionId !== null} className="rounded bg-[var(--destructive)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Reject document</button></div></div>
            <details><summary className="cursor-pointer text-xs text-[var(--muted)]">Supporting tag detail (read-only)</summary>
            <div className="mt-3 space-y-3">
        {group.tags.map((tag) => (
          <div key={tag.id} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-sm">&ldquo;{tag.provenance.segmentText}&rdquo;</p>
              <span className="shrink-0 rounded-full border border-[var(--card-border)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">AI suggestion</span>
            </div>
            <div className="mb-3 rounded-md bg-[var(--surface-muted)] p-3 text-xs text-[var(--muted)]">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>Source: {tag.provenance.sourceType.replaceAll("_", " ")}</span>
                <span>Confidence: {Math.round(tag.provenance.aiConfidence * 100)}%</span>
                <span>Captured: {new Date(tag.provenance.capturedAt).toLocaleString()}</span>
              </div>
              {tag.provenance.locationTag && <div className="mt-1">Location: {tag.provenance.locationTag}</div>}
              {tag.provenance.sourceRef && <a href={tag.provenance.sourceRef} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[var(--accent)] underline">Open original source</a>}
            </div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">{tag.targetType}: {tag.targetName} &middot; {Math.round(tag.confidence * 100)}% confidence</span>
            </div>
          </div>
        ))}
            </div></details>
          </section>
        ))}
      </div>
    </div>
  );
}
