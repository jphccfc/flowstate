"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

type Agenda = {
  id: string;
  title: string;
  startsAt: string | null;
  dateTime: string | null;
  domainName: string | null;
  domain: string | null;
  objectives: string | null;
  agendaItems: string[];
  desiredOutcome: string | null;
  stakeholderName: string | null;
  _count?: { capturedInputs: number };
};

type AgendaForm = {
  title: string;
  dateTime: string;
  domain: string;
  objectives: string;
  agendaItems: string;
  desiredOutcome: string;
};

const emptyForm: AgendaForm = { title: "", dateTime: "", domain: "", objectives: "", agendaItems: "", desiredOutcome: "" };
const domains = ["Operations", "Financial and Legal", "People", "Technology and Data", "Customers and Revenue"];

function scratchpadHref(context: Agenda, organizationId: string) {
  return `/clients/${organizationId}/scratchpad?contextId=${encodeURIComponent(context.id)}`;
}

export default function MeetingAgendasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [form, setForm] = useState<AgendaForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  async function loadAgendas() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/meeting-contexts?organizationId=${encodeURIComponent(organizationId)}`);
      if (!response.ok) throw new Error(`Unable to load meeting agendas (${response.status}).`);
      const value = await response.json() as Agenda[];
      setAgendas(Array.isArray(value) ? value : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load meeting agendas.");
    } finally {
      setLoading(false);
    }
  }

  // Loading is an external request; the state updates happen in its completion handlers.
  useEffect(() => { loadAgendas(); }, [organizationId]); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  function editAgenda(agenda: Agenda) {
    setEditingId(agenda.id);
    setSaveMessage(null);
    setForm({ title: agenda.title, dateTime: (agenda.dateTime ?? agenda.startsAt ?? "").slice(0, 16), domain: agenda.domain ?? agenda.domainName ?? "", objectives: agenda.objectives ?? "", agendaItems: agenda.agendaItems.join("\n"), desiredOutcome: agenda.desiredOutcome ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startNewAgenda() { setEditingId(null); setForm(emptyForm); setSaveMessage(null); }

  async function saveAgenda(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true); setError(null); setSaveMessage(null);
    const agendaItems = form.agendaItems.split("\n").map(item => item.trim()).filter(Boolean);
    const payload = { organizationId, title: form.title, dateTime: form.dateTime || undefined, startsAt: form.dateTime || undefined, domain: form.domain, domainName: form.domain, objectives: form.objectives, agendaItems, desiredOutcome: form.desiredOutcome };
    try {
      const response = await fetch(editingId ? `/api/meeting-contexts/${editingId}` : "/api/meeting-contexts", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`Unable to save agenda (${response.status}).`);
      await loadAgendas();
      setSaveMessage(editingId ? "Agenda updated." : "Agenda created.");
      setEditingId(null); setForm(emptyForm);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save agenda.");
    } finally { setSaving(false); }
  }

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div><Link href={`/clients/${organizationId}`} className="text-sm text-[var(--muted)]">← Back to client</Link><h1 className="mt-2 text-3xl font-bold">Meeting Agendas</h1><p className="mt-1 text-sm text-[var(--muted)]">Create and prepare meeting context before capturing raw evidence. Agenda context is not evidence or an approved decision.</p></div>
        <Link href={`/clients/${organizationId}/capture`} className="rounded border border-[var(--card-border)] px-3 py-2 text-sm">Capture Evidence</Link>
      </div>

      <section className="workspace-card mb-8 p-4 sm:p-6" aria-labelledby="agenda-form-title">
        <div className="flex items-center justify-between gap-3"><h2 id="agenda-form-title" className="text-lg font-semibold">{editingId ? "Update agenda" : "Create agenda"}</h2>{editingId && <button type="button" onClick={startNewAgenda} className="text-sm text-[var(--accent)] underline">Cancel edit</button>}</div>
        <form onSubmit={saveAgenda} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input required aria-label="Meeting title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Meeting title" className="rounded border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm" />
          <input aria-label="Meeting date and time" type="datetime-local" value={form.dateTime} onChange={e => setForm({ ...form, dateTime: e.target.value })} className="rounded border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm" />
          <select aria-label="Domain" value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} className="rounded border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm"><option value="">Select domain</option>{domains.map(domain => <option key={domain}>{domain}</option>)}</select>
          <input aria-label="Desired outcome" value={form.desiredOutcome} onChange={e => setForm({ ...form, desiredOutcome: e.target.value })} placeholder="Desired outcome" className="rounded border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm" />
          <textarea aria-label="Objectives" value={form.objectives} onChange={e => setForm({ ...form, objectives: e.target.value })} placeholder="Objectives" rows={3} className="rounded border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm sm:col-span-2" />
          <textarea aria-label="Paste agenda text" value={form.agendaItems} onChange={e => setForm({ ...form, agendaItems: e.target.value })} placeholder="Paste agenda text (one item per line)" rows={5} className="rounded border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm sm:col-span-2" />
          <p className="text-xs text-[var(--muted)] sm:col-span-2">Import agenda items turns each non-empty pasted line into a separate agenda item. No external mailbox or document connector is used.</p>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><button type="submit" disabled={saving || !form.title.trim()} className="flowstate-accent-button rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving…" : editingId ? "Update agenda" : "Create agenda"}</button>{saveMessage && <span role="status" className="text-sm text-[var(--muted)]">{saveMessage}</span>}</div>
        </form>
      </section>

      <section aria-labelledby="agenda-list-title"><div className="mb-3 flex items-center justify-between"><h2 id="agenda-list-title" className="text-xl font-semibold">Saved meeting agendas</h2><button type="button" onClick={startNewAgenda} className="text-sm font-medium text-[var(--accent)] underline">Create agenda</button></div>
        {error && <p role="alert" className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
        {loading ? <p role="status" className="text-sm text-[var(--muted)]">Loading meeting agendas…</p> : agendas.length === 0 ? <div className="workspace-card p-6"><p className="font-medium">No meeting agendas yet</p><p className="mt-1 text-sm text-[var(--muted)]">Create an agenda above to prepare your first meeting and start a linked Scratch Pad.</p></div> : <div className="grid gap-4">{agendas.map(agenda => <article key={agenda.id} className="workspace-card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{agenda.title}</h3><p className="mt-1 text-sm text-[var(--muted)]">{agenda.dateTime || agenda.startsAt ? new Date(agenda.dateTime ?? agenda.startsAt!).toLocaleString() : "Date not set"}{(agenda.domain ?? agenda.domainName) && ` · ${agenda.domain ?? agenda.domainName}`}</p></div><span className="text-sm text-[var(--muted)]">Linked captures: {agenda._count?.capturedInputs ?? 0}</span></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="font-medium">Objectives</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--muted)]">{agenda.objectives || "Not set"}</dd></div><div><dt className="font-medium">Agenda items</dt><dd className="mt-1 text-[var(--muted)]">{agenda.agendaItems.length ? <ol className="list-decimal space-y-1 pl-5">{agenda.agendaItems.map(item => <li key={item}>{item}</li>)}</ol> : "No agenda items"}</dd></div></dl><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => editAgenda(agenda)} className="rounded border border-[var(--card-border)] px-3 py-2 text-sm">Update agenda</button><Link href={scratchpadHref(agenda, organizationId)} className="flowstate-accent-button rounded px-3 py-2 text-sm font-medium text-white">Start Scratch Pad</Link></div></article>)}</div>}
      </section>
    </main>
  );
}
