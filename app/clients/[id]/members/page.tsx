"use client";

import { use, useEffect, useState } from "react";

type Member = { id: string; userId: string; email: string; name: string | null; role: string; permissions: string[] };
const roles = ["ADVISOR", "CLIENT_EXECUTIVE", "CLIENT_STAKEHOLDER", "INVESTOR"] as const;

export default function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof roles)[number]>("CLIENT_STAKEHOLDER");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/clients/${id}/members`).then(async (response) => {
      const data = await response.json();
      if (!active) return;
      if (!response.ok) return setError(data.error ?? "Unable to load members");
      setMembers(data);
    });
    return () => { active = false; };
  }, [id]);

  async function addMember(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const response = await fetch(`/api/clients/${id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "Unable to add member");
    setMembers((current) => [...current.filter((member) => member.userId !== data.userId), data]); setEmail("");
  }

  async function changeRole(userId: string, nextRole: string) {
    const response = await fetch(`/api/clients/${id}/members`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role: nextRole }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "Unable to change role");
    setMembers((current) => current.map((member) => member.userId === userId ? data : member));
  }

  return <main className="max-w-5xl mx-auto w-full px-4 py-8">
    <h1 className="text-2xl font-bold text-[var(--foreground)]">Organisation members</h1>
    <p className="text-sm text-[var(--muted)] mt-1 mb-6">Roles control what each user can see and do within this client organisation.</p>
    {error && <div role="alert" className="mb-4 rounded-lg border border-[var(--destructive)] p-3 text-sm text-[var(--destructive)]">{error}</div>}
    <form onSubmit={addMember} className="flex flex-wrap gap-2 mb-6">
      <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com" className="flex-1 min-w-56 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm" />
      <select value={role} onChange={(event) => setRole(event.target.value as (typeof roles)[number])} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm">{roles.map((item) => <option key={item}>{item}</option>)}</select>
      <button className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white">Add or update</button>
    </form>
    <div className="space-y-3">{members.map((member) => <section key={member.userId} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-medium text-[var(--foreground)]">{member.name ?? member.email}</div><div className="text-sm text-[var(--muted)]">{member.email}</div></div><select value={member.role} onChange={(event) => void changeRole(member.userId, event.target.value)} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm">{roles.map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="mt-3 flex flex-wrap gap-1">{member.permissions.map((permission) => <span key={permission} className="rounded bg-[var(--muted-bg)] px-2 py-1 text-xs text-[var(--muted)]">{permission}</span>)}</div>
    </section>)}</div>
  </main>;
}
