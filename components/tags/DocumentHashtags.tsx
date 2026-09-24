"use client";

import { useCallback, useEffect, useState } from "react";
import { parseHashtagInput } from "@/lib/tags/hashtags";

type TagDefinition = { id: string; displayName: string; normalizedName: string };
type Attachment = { id: string; tagDefinition: TagDefinition };

export function DocumentHashtags({ organizationId, capturedInputId }: { organizationId: string; capturedInputId: string }) {
  const [catalogue, setCatalogue] = useState<TagDefinition[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [catalogueResponse, attachmentResponse] = await Promise.all([
      fetch(`/api/clients/${organizationId}/hashtags`),
      fetch(`/api/clients/${organizationId}/hashtags/attachments?capturedInputId=${encodeURIComponent(capturedInputId)}`),
    ]);
    if (catalogueResponse.ok) setCatalogue(await catalogueResponse.json());
    if (attachmentResponse.ok) setAttachments(await attachmentResponse.json());
  }, [organizationId, capturedInputId]);

  // API hydration; this is intentionally the synchronisation boundary for this client component.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function postAttachment(tagDefinitionId: string) {
    const response = await fetch(`/api/clients/${organizationId}/hashtags/attachments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tagDefinitionId, capturedInputId }) });
    // A tag already attached to this document is a successful no-op.
    if (response.status === 409) return;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to attach hashtag.");
  }

  async function attach(tagDefinitionId: string) {
    setBusy(true); setError("");
    try {
      await postAttachment(tagDefinitionId);
      setSelectedId("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to attach hashtag."); }
    finally { setBusy(false); }
  }

  async function createAndAttach() {
    const names = parseHashtagInput(newTag);
    if (names.length === 0) return;
    setBusy(true); setError("");
    try {
      for (const displayName of names) {
        const response = await fetch(`/api/clients/${organizationId}/hashtags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to create hashtag.");
        await postAttachment(data.id);
      }
      setNewTag("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create hashtag."); }
    finally { setBusy(false); }
  }

  const attachedIds = new Set(attachments.map((attachment) => attachment.tagDefinition.id));
  return <div className="mt-3 border-t border-[var(--card-border)] pt-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium text-[var(--muted)]">Hashtags</span><span className="text-xs text-[var(--muted)]">Reusable across this client workspace</span></div>
    {attachments.length > 0 && <div className="mb-2 flex flex-wrap gap-1">{attachments.map((attachment) => <span key={attachment.id} className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-xs text-[var(--accent)]">#{attachment.tagDefinition.normalizedName}</span>)}</div>}
    <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><select aria-label="Attach existing hashtag" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="rounded border border-[var(--card-border)] bg-[var(--card)] px-2 py-1.5 text-xs"><option value="">Attach an existing hashtag…</option>{catalogue.filter((tag) => !attachedIds.has(tag.id)).map((tag) => <option key={tag.id} value={tag.id}>#{tag.normalizedName}</option>)}</select><button type="button" onClick={() => void attach(selectedId)} disabled={!selectedId || busy} className="rounded px-3 py-1.5 text-xs font-medium text-white flowstate-accent-button disabled:opacity-50">Attach</button></div>
    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]"><input aria-label="Create hashtag" value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="Create hashtag, e.g. Project Falcon" className="rounded border border-[var(--card-border)] bg-[var(--card)] px-2 py-1.5 text-xs" /><button type="button" onClick={() => void createAndAttach()} disabled={!newTag.trim() || busy} className="rounded border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium disabled:opacity-50">Create & attach</button></div>
    <p className="mt-1 text-xs text-[var(--muted)]">Separate multiple hashtags with commas. Spaces within one hashtag become hyphens.</p>
    {error && <p role="alert" className="mt-2 text-xs text-[var(--destructive)]">{error}</p>}
  </div>;
}
