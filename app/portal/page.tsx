"use client";

import { useEffect, useState } from "react";

type Organisation = { id: string; name: string; roles: string[] };
type Task = { id: string; title: string; description: string; dueDate: string; priority: number; status: string };
type Meeting = { id: string; title: string; startsAt: string | null; dateTime: string | null; objectives: string | null; agendaItems: string[]; desiredOutcome: string | null };

export default function ExternalPortalPage() {
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/external/organizations").then(async response => {
      if (!response.ok) throw new Error(response.status === 401 ? "Please sign in to access your portal." : "You do not have portal access yet.");
      return response.json() as Promise<Organisation[]>;
    }).then(items => { setOrganisations(items); setOrganizationId(items[0]?.id ?? ""); }).catch(cause => setError(cause instanceof Error ? cause.message : "Unable to load your portal.")).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true); setError(null);
    Promise.all(["/api/external/tasks", "/api/external/meetings"].map(path => fetch(`${path}?organizationId=${encodeURIComponent(organizationId)}`).then(async response => {
      if (!response.ok) throw new Error("Unable to load your assigned portal information.");
      return response.json();
    }))).then(([taskRows, meetingRows]) => { setTasks(taskRows as Task[]); setMeetings(meetingRows as Meeting[]); }).catch(cause => setError(cause instanceof Error ? cause.message : "Unable to load your portal.")).finally(() => setLoading(false));
  }, [organizationId]);

  async function updateTask(taskId: string, payload: { complete?: true; comment?: string }) {
    const response = await fetch(`/api/external/tasks/${encodeURIComponent(taskId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) { setError("Your task update could not be saved."); return; }
    const updated = await response.json() as Task;
    setTasks(current => current.map(task => task.id === updated.id ? updated : task));
  }

  return <main className="mx-auto max-w-5xl p-4 sm:p-6"><header className="mb-6"><h1 className="text-2xl font-bold">Your Flowstate portal</h1><p className="mt-1 text-sm text-[var(--muted)]">Your assigned actions and meeting records.</p></header>{error ? <p role="alert" className="rounded border border-[var(--destructive)] p-3 text-[var(--destructive)]">{error}</p> : <>{organisations.length > 1 && <label className="mb-5 block text-sm font-medium">Organisation<select value={organizationId} onChange={event => setOrganizationId(event.target.value)} className="mt-1 block w-full rounded border border-[var(--card-border)] bg-transparent p-2">{organisations.map(organization => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>}{loading ? <p role="status">Loading your portal…</p> : <div className="grid gap-6 md:grid-cols-2"><section className="workspace-card p-4"><h2 className="text-lg font-semibold">Your tasks</h2><div className="mt-3 space-y-3">{tasks.map(task => <article key={task.id} className="rounded border border-[var(--card-border)] p-3"><h3 className="font-medium">{task.title}</h3><p className="mt-1 text-sm">{task.description}</p><p className="mt-2 text-xs text-[var(--muted)]">{task.status.replaceAll("_", " ")} · Due {new Date(task.dueDate).toLocaleDateString()}</p><div className="mt-3 flex gap-3"><button type="button" disabled={task.status === "COMPLETED"} onClick={() => void updateTask(task.id, { complete: true })} className="rounded border px-2 py-1 text-sm disabled:opacity-50">{task.status === "COMPLETED" ? "Completed" : "Mark complete"}</button><button type="button" onClick={() => { const comment = window.prompt("Add comment"); if (comment?.trim()) void updateTask(task.id, { comment: comment.trim() }); }} className="text-sm underline">Add comment</button></div></article>)}{tasks.length === 0 && <p className="text-sm text-[var(--muted)]">No tasks are currently assigned to you.</p>}</div></section><section className="workspace-card p-4"><h2 className="text-lg font-semibold">Your meetings</h2><div className="mt-3 space-y-3">{meetings.map(meeting => <article key={meeting.id} className="rounded border border-[var(--card-border)] p-3"><h3 className="font-medium">{meeting.title}</h3>{meeting.objectives && <p className="mt-1 text-sm">{meeting.objectives}</p>}<p className="mt-2 text-xs text-[var(--muted)]">{meeting.dateTime || meeting.startsAt ? new Date(meeting.dateTime ?? meeting.startsAt as string).toLocaleString() : "Date to be confirmed"}</p></article>)}{meetings.length === 0 && <p className="text-sm text-[var(--muted)]">No meeting records are currently shared with you.</p>}</div></section></div>}</>}</main>;
}
