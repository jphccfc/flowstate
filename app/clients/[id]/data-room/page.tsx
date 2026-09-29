"use client";

import { useEffect, useState } from "react";

type LinkedInput = { id: string; sourcePath: string | null; sourceRef: string | null };
type Item = { id: string; title: string; detail: string | null; status: string; completionNote: string | null; linkedInput: LinkedInput | null };
type InputOption = { id: string; sourcePath: string | null; sourceRef: string | null; subject: string | null; status: string; attachments: Array<{ filename: string }>; meetingContext: { title: string } | null };
type Pack = {
  id: string;
  title: string;
  assessmentTask: { id: string; title: string; status: string; dueDate: string };
  progress: { total: number; applicable: number; partiallyReceived: number; received: number; accepted: number; followUpRequired: number; fulfilmentPercent: number; reviewPercent: number };
  categories: Array<{ id: string; title: string; requests: Item[] }>;
};

const statuses = ["REQUESTED", "PARTIALLY_RECEIVED", "RECEIVED", "ACCEPTED", "FOLLOW_UP_REQUIRED", "NOT_APPLICABLE"];
const label = (value: string) => value === "NOT_APPLICABLE" ? "No longer needed" : value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const inputLabel = (input: InputOption | LinkedInput) => "attachments" in input ? input.subject ?? input.attachments[0]?.filename ?? input.meetingContext?.title ?? input.sourcePath ?? input.sourceRef ?? "Untitled evidence" : input.sourcePath ?? input.sourceRef ?? "Untitled evidence";

export default function DataRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [packs, setPacks] = useState<Pack[]>([]);
  const [inputs, setInputs] = useState<InputOption[]>([]);
  const [error, setError] = useState("");
  const [loadingPacks, setLoadingPacks] = useState(true);

  async function load(clientId: string) {
    setLoadingPacks(true);
    const packResponse = await fetch(`/api/clients/${clientId}/data-room`);
    const packBody = await packResponse.json();
    if (packResponse.ok) setPacks(packBody); else setError(packBody.error ?? "Unable to load data room requests");
    setLoadingPacks(false);
    void fetch(`/api/captured-inputs?organizationId=${encodeURIComponent(clientId)}`).then(async (inputResponse) => {
      const inputBody = await inputResponse.json();
      if (inputResponse.ok) setInputs((Array.isArray(inputBody) ? inputBody : []).filter((input: InputOption) => input.status !== "QUARANTINED"));
      else setError((current) => current || inputBody.error || "Unable to load linkable evidence");
    }).catch(() => setError((current) => current || "Unable to load linkable evidence"));
  }

  useEffect(() => { params.then(({ id: clientId }) => { setId(clientId); void load(clientId); }); }, [params]);

  async function update(item: Item, status: string) {
    const note = status === "NOT_APPLICABLE" ? window.prompt("Why is this request not applicable?") : item.completionNote;
    if (status === "NOT_APPLICABLE" && !note) return;
    const response = await fetch(`/api/clients/${id}/data-room`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: item.id, status, completionNote: note }),
    });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Unable to update request"); else void load(id);
  }

  async function addRequest(categoryId: string) {
    const requestTitle = window.prompt("Request title");
    if (!requestTitle?.trim()) return;
    const detail = window.prompt("Optional detail or context") ?? "";
    const response = await fetch(`/api/clients/${id}/data-room`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId, requestTitle, detail }) });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Unable to add request"); else void load(id);
  }

  async function editRequest(item: Item) {
    const title = window.prompt("Request title", item.title);
    if (title === null) return;
    const detail = window.prompt("Optional detail or context", item.detail ?? "");
    if (detail === null) return;
    const response = await fetch(`/api/clients/${id}/data-room`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: item.id, title, detail }) });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Unable to edit request"); else void load(id);
  }

  async function markNoLongerNeeded(item: Item) {
    const completionNote = window.prompt("Why is this request no longer needed?");
    if (!completionNote?.trim()) return;
    const response = await fetch(`/api/clients/${id}/data-room`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: item.id, status: "NOT_APPLICABLE", completionNote }) });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Unable to update request"); else void load(id);
  }

  async function deleteRequest(item: Item) {
    if (!window.confirm(`Delete “${item.title}”? This is only available for untouched, unlinked requests.`)) return;
    const response = await fetch(`/api/clients/${id}/data-room?requestId=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Unable to delete request"); else void load(id);
  }

  async function linkEvidence(item: Item, linkedInputId: string) {
    const response = await fetch(`/api/clients/${id}/data-room`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: item.id, status: item.status, completionNote: item.completionNote, linkedInputId }),
    });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Unable to link evidence"); else void load(id);
  }

  async function cancelPack(pack: Pack) {
    if (!window.confirm(`Cancel “${pack.title}”? This preserves the request and evidence history but stops it as an active task.`)) return;
    const response = await fetch(`/api/clients/${id}/tasks`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: pack.assessmentTask.id, status: "CANCELLED" }),
    });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Unable to cancel request pack"); else void load(id);
  }

  return <main className="max-w-5xl mx-auto w-full px-4 py-8">
    <div className="mb-8"><div className="workspace-eyebrow mb-2">Assessment operations</div><h1 className="workspace-heading text-3xl font-bold">Data room requests</h1><p className="text-sm text-[var(--muted)] mt-2">Grouped diligence evidence requests. Receipt and review are tracked separately.</p></div>
    {error ? <p role="alert" className="text-[var(--destructive)]">{error}</p> : null}
    {loadingPacks ? <section className="workspace-card p-5" aria-live="polite">Loading data room requests…</section> : packs.length === 0 ? <section className="workspace-card p-5">No Data Room Request Pack has been created for this client.</section> : packs.map((pack) => <section key={pack.id} className="workspace-card p-5 mb-5">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold">{pack.title}</h2><p className="text-sm text-[var(--muted)]">Assessment task: {pack.assessmentTask.title} · {label(pack.assessmentTask.status)}</p></div><div className="text-sm"><strong>{pack.progress.fulfilmentPercent}% received</strong> · {pack.progress.received}/{pack.progress.applicable} applicable<br/><strong>{pack.progress.reviewPercent}% reviewed</strong> · {pack.progress.accepted}/{pack.progress.received} received{pack.progress.partiallyReceived ? ` · ${pack.progress.partiallyReceived} partial` : ""}</div></div>
      {pack.assessmentTask.status !== "CANCELLED" ? <button type="button" className="mt-3 rounded border border-[var(--destructive)] px-3 py-1.5 text-sm text-[var(--destructive)]" onClick={() => void cancelPack(pack)}>Cancel request pack</button> : <p className="mt-3 text-sm text-[var(--muted)]">This request pack is cancelled. Its evidence and history are retained.</p>}
      <div className="mt-5 space-y-3">{pack.categories.map((category) => <details key={category.id} className="rounded-lg border border-[var(--border)] p-3"><summary className="cursor-pointer font-medium">{category.title} <span className="text-[var(--muted)]">({category.requests.filter((item) => item.status === "RECEIVED" || item.status === "ACCEPTED").length}/{category.requests.filter((item) => item.status !== "NOT_APPLICABLE").length} received)</span></summary><button type="button" className="mt-3 rounded border px-2.5 py-1 text-sm" onClick={() => void addRequest(category.id)}>Add request</button><ul className="mt-3 space-y-3">{category.requests.map((item) => <li key={item.id} className="flex flex-wrap gap-3 justify-between border-t border-[var(--border)] pt-3"><div className="max-w-2xl"><p>{item.title}</p>{item.detail ? <p className="mt-1 text-sm text-[var(--muted)]">{item.detail}</p> : null}<div className="mt-2 flex flex-wrap gap-2"><button type="button" className="text-sm underline" onClick={() => void editRequest(item)}>Edit request</button><button type="button" className="text-sm underline" onClick={() => void markNoLongerNeeded(item)}>No longer needed</button>{item.status === "REQUESTED" && !item.linkedInput && !item.completionNote ? <button type="button" className="text-sm text-[var(--destructive)] underline" onClick={() => void deleteRequest(item)}>Delete request</button> : null}</div>{item.linkedInput ? <a className="text-sm underline" href={`/clients/${id}/documents/${item.linkedInput.id}`}>View linked evidence: {inputLabel(item.linkedInput)}</a> : null}</div><div className="flex flex-wrap gap-2"><label className="text-sm">Status <select aria-label={`Status for ${item.title}`} className="dashboard-input ml-2 p-1" value={item.status} onChange={(event) => void update(item, event.target.value)}>{statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label><label className="text-sm">Link evidence <select aria-label={`Evidence for ${item.title}`} className="dashboard-input ml-2 p-1" value={item.linkedInput?.id ?? ""} onChange={(event) => void linkEvidence(item, event.target.value)}><option value="">No linked evidence</option>{inputs.map((input) => <option key={input.id} value={input.id}>{inputLabel(input)}</option>)}</select></label></div></li>)}</ul></details>)}</div>
    </section>)}
  </main>;
}
