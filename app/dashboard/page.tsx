"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";

interface OrgSummary {
  id: string;
  name: string;
  industry: string | null;
  size: string | null;
  createdAt: string;
  _count: { domains: number; sessions: number };
}

export default function DashboardPage() {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then(setOrgs)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, industry: newIndustry }),
    });
    const org = await res.json();
    setOrgs((prev) => [org, ...prev]);
    setShowNew(false);
    setNewName("");
    setNewIndustry("");
    setCreating(false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Client Organisations</h1>
            <p className="text-sm text-[var(--muted)] mt-0.5">Manage your capability assessments</p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:bg-[#1a3352] transition-colors"
          >
            + New Client
          </button>
        </div>

        {showNew && (
          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 mb-6 shadow-sm">
            <h2 className="font-semibold text-[var(--foreground)] mb-4">New Client Organisation</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--muted)] block mb-1">Organisation Name *</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                    placeholder="Acme Corp"
                    className="w-full px-3 py-2 border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--muted)] block mb-1">Industry</label>
                  <input
                    value={newIndustry}
                    onChange={(e) => setNewIndustry(e.target.value)}
                    placeholder="e.g. Technology, Retail"
                    className="w-full px-3 py-2 border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="px-4 py-2 rounded-lg text-sm text-[var(--muted)] hover:bg-[var(--muted-bg)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:bg-[#1a3352] disabled:opacity-50 transition-colors"
                >
                  {creating ? "Creating..." : "Create Client"}
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-[var(--muted)]">Loading clients...</div>
        ) : orgs.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-[var(--card-border)]">
            <div className="text-4xl mb-3">📋</div>
            <h3 className="font-semibold text-[var(--foreground)] mb-1">No clients yet</h3>
            <p className="text-sm text-[var(--muted)] mb-4">Create your first client to begin an assessment</p>
            <button
              onClick={() => setShowNew(true)}
              className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:bg-[#1a3352] transition-colors"
            >
              + New Client
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {orgs.map((org) => (
              <Link
                key={org.id}
                href={`/clients/${org.id}`}
                className="bg-white rounded-xl border border-[var(--card-border)] p-5 hover:shadow-md transition-shadow flex items-center gap-4"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                  <span className="font-bold text-[var(--primary)] text-sm">
                    {org.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[var(--foreground)]">{org.name}</div>
                  {org.industry && (
                    <div className="text-sm text-[var(--muted)]">{org.industry}</div>
                  )}
                </div>
                <div className="text-right shrink-0 text-sm text-[var(--muted)]">
                  <div>{org._count.domains} domains</div>
                  <div>{org._count.sessions} sessions</div>
                </div>
                <div className="text-[var(--muted)] text-lg">›</div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
