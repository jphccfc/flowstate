"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

type User = { id: string; email: string; name: string | null; role: string; organizations: { role: string; organization: { id: string; name: string } }[] };
type Organization = { id: string; name: string; industry: string | null; _count: { users: number; domains: number; sessions: number } };
const roles = ["SYSTEM_ADMIN", "ADVISOR", "CLIENT_EXECUTIVE", "CLIENT_STAKEHOLDER", "INVESTOR"];

export default function PlatformAdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/users").then(async (response) => {
      const data = await response.json();
      if (!active) return;
      if (!response.ok) return setError(data.error ?? "Unable to load platform administration");
      setUsers(data.users); setOrganizations(data.organizations); setLoading(false);
    }).catch(() => setError("Unable to load platform administration"));
    return () => { active = false; };
  }, []);

  const query = search.trim().toLowerCase();
  const filteredUsers = users.filter((user) => `${user.name ?? ""} ${user.email} ${user.role} ${user.organizations.map((item) => item.organization.name).join(" ")}`.toLowerCase().includes(query));
  const filteredOrganizations = organizations.filter((org) => `${org.name} ${org.industry ?? ""}`.toLowerCase().includes(query));

  async function changeRole(userId: string, role: string) {
    setError("");
    const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "Unable to update user role");
    setUsers((current) => current.map((user) => user.id === userId ? { ...user, role: data.role } : user));
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return <div className="admin-shell">
    <aside className="admin-rail">
      <div className="admin-rail-header"><Link href="/dashboard" className="workspace-brand"><span className="workspace-brand-mark" aria-hidden="true">FS</span><span className="workspace-brand-name">Flowstate</span></Link></div>
      <div className="admin-context"><div className="workspace-context-label">Platform control</div><div className="workspace-context-name">Administration</div></div>
      <nav className="workspace-nav" aria-label="Platform navigation"><Link href="/admin" aria-current="page" className="workspace-nav-link"><span className="workspace-nav-icon" aria-hidden="true">01</span>Administration</Link><Link href="/admin/agents" className="workspace-nav-link"><span className="workspace-nav-icon" aria-hidden="true">02</span>Agent catalogue</Link><Link href="/dashboard" className="workspace-nav-link"><span className="workspace-nav-icon" aria-hidden="true">03</span>Client workspaces</Link></nav>
      <div className="admin-rail-actions"><ThemeToggle /><button type="button" className="workspace-signout" onClick={signOut}>Sign out</button></div>
    </aside>

    <main className="admin-content">
      <header className="admin-header"><div><div className="workspace-eyebrow">Platform control centre</div><h1 className="workspace-heading admin-title">Administration</h1><p className="admin-subtitle">Manage global access and keep an overview of every client organisation.</p></div><div className="admin-status"><span className="admin-status-dot" aria-hidden="true" /> System administrator</div></header>
      {error && <div role="alert" className="admin-alert">{error}</div>}
      {loading ? <div className="workspace-card admin-loading">Loading platform data…</div> : <>
        <section className="workspace-card admin-search-panel" aria-label="Search platform data"><label htmlFor="admin-search" className="admin-search-label">Search users and organisations</label><div className="admin-search-row"><input id="admin-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email, role or organisation…" className="admin-search-input" /><span className="admin-search-count">{filteredUsers.length} users · {filteredOrganizations.length} organisations</span></div></section>
        <section className="admin-summary-grid" aria-label="Platform summary"><div className="workspace-card workspace-stat admin-summary-card"><div className="admin-card-label">Users</div><div className="workspace-stat-value admin-summary-value">{users.length}</div><div className="admin-card-note">Global accounts</div></div><div className="workspace-card workspace-stat admin-summary-card"><div className="admin-card-label">Organisations</div><div className="workspace-stat-value admin-summary-value">{organizations.length}</div><div className="admin-card-note">Client workspaces</div></div><div className="workspace-card workspace-stat admin-summary-card"><div className="admin-card-label">Administrators</div><div className="workspace-stat-value admin-summary-value">{users.filter((user) => user.role === "SYSTEM_ADMIN").length}</div><div className="admin-card-note">Privileged accounts</div></div></section>
        <section className="workspace-card admin-panel"><div className="admin-panel-heading"><div><div className="workspace-eyebrow">Access directory</div><h2 className="workspace-heading admin-panel-title">Users and global roles</h2></div><span className="admin-panel-count">{filteredUsers.length} of {users.length} accounts</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th scope="col">User</th><th scope="col">Organisation access</th><th scope="col">Global role</th></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id}><td><div className="admin-user-name">{user.name ?? user.email}</div><div className="admin-user-email">{user.email}</div></td><td><span className="admin-org-count">{user.organizations.length}</span> organisation{user.organizations.length === 1 ? "" : "s"}</td><td><select aria-label={`Global role for ${user.email}`} value={user.role} onChange={(event) => void changeRole(user.id, event.target.value)} className="admin-role-select">{roles.map((role) => <option key={role}>{role}</option>)}</select></td></tr>)}</tbody></table></div></section>
        <section className="workspace-card admin-panel"><div className="admin-panel-heading"><div><div className="workspace-eyebrow">Tenant overview</div><h2 className="workspace-heading admin-panel-title">Client organisations</h2></div><span className="admin-panel-count">{filteredOrganizations.length} of {organizations.length} workspaces</span></div><div className="admin-org-grid">{filteredOrganizations.map((org) => <article key={org.id} className="admin-org-card"><div className="admin-org-mark" aria-hidden="true">{org.name.slice(0, 2).toUpperCase()}</div><div className="admin-org-details"><h3><Link href={`/clients/${org.id}`} className="admin-org-link">{org.name}</Link></h3><p>{org.industry ?? "Industry not set"}</p><div className="admin-org-metrics"><span>{org._count.users} members</span><span>{org._count.domains} domains</span><span>{org._count.sessions} sessions</span></div><Link href={`/clients/${org.id}/members`} className="admin-manage-link">Manage members →</Link></div></article>)}</div></section>
        {search && filteredUsers.length === 0 && filteredOrganizations.length === 0 && <div className="admin-empty">No users or organisations match “{search}”.</div>}
      </>}
    </main>
  </div>;
}
