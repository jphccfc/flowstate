"use client";

import { useEffect, useState } from "react";

type User = { id: string; email: string; name: string | null; role: string; organizations: { role: string; organization: { id: string; name: string } }[] };
type Organization = { id: string; name: string; industry: string | null; _count: { users: number; domains: number; sessions: number } };
const roles = ["SYSTEM_ADMIN", "ADVISOR", "CLIENT_EXECUTIVE", "CLIENT_STAKEHOLDER", "INVESTOR"];

export default function PlatformAdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/users").then(async (response) => {
      const data = await response.json();
      if (!active) return;
      if (!response.ok) return setError(data.error ?? "Unable to load platform administration");
      setUsers(data.users); setOrganizations(data.organizations);
    });
    return () => { active = false; };
  }, []);

  async function changeRole(userId: string, role: string) {
    const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "Unable to update user role");
    setUsers((current) => current.map((user) => user.id === userId ? { ...user, role: data.role } : user));
  }

  return <main className="max-w-6xl mx-auto w-full px-4 py-8">
    <div className="mb-6"><h1 className="text-2xl font-bold text-[var(--foreground)]">Platform administration</h1><p className="text-sm text-[var(--muted)] mt-1">Global user roles and all client organisations. Restricted to system administrators.</p></div>
    {error && <div role="alert" className="mb-4 rounded-lg border border-[var(--destructive)] p-3 text-sm text-[var(--destructive)]">{error}</div>}
    <section className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 mb-6"><h2 className="font-semibold text-[var(--foreground)] mb-4">Users and global roles</h2><div className="space-y-3">{users.map((user) => <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] pb-3 last:border-0 last:pb-0"><div><div className="font-medium text-[var(--foreground)]">{user.name ?? user.email}</div><div className="text-sm text-[var(--muted)]">{user.email} · {user.organizations.length} organisation(s)</div></div><select value={user.role} onChange={(event) => void changeRole(user.id, event.target.value)} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm">{roles.map((role) => <option key={role}>{role}</option>)}</select></div>)}</div></section>
    <section className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5"><h2 className="font-semibold text-[var(--foreground)] mb-4">All client organisations</h2><div className="grid gap-3 sm:grid-cols-2">{organizations.map((org) => <div key={org.id} className="rounded-lg border border-[var(--card-border)] p-4"><div className="font-medium text-[var(--foreground)]">{org.name}</div><div className="text-sm text-[var(--muted)]">{org.industry ?? "Industry not set"}</div><div className="mt-2 text-xs text-[var(--muted)]">{org._count.users} members · {org._count.domains} domains · {org._count.sessions} sessions</div></div>)}</div></section>
  </main>;
}
