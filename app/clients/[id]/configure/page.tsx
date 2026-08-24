"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { FlowstateDialog } from "@/components/ui/FlowstateDialog";

const DOMAIN_COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c",
  "#0891b2", "#65a30d", "#db2777", "#0d9488", "#7c3aed",
];

const DEFAULT_DOMAINS = [
  { name: "Operations", color: "#2563eb" },
  { name: "Financial & Legal", color: "#16a34a" },
  { name: "People", color: "#9333ea" },
  { name: "Technology & Data", color: "#ea580c" },
  { name: "Customers & Revenue", color: "#dc2626" },
];

type Capability = {
  id: string;
  name: string;
  description: string | null;
  aliases: string[];
  dimensions: string[];
  metrics: string[];
  tags: string[];
  importanceScore: number | null;
  order: number;
};

type Domain = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  order: number;
  capabilities: Capability[];
};

type KPI = { id: string; name: string; description: string | null; targetValue: string | null; currentValue: string | null; measurementFrequency: string | null };
type Achievement = { id: string; description: string; priority: number | null; targetDate: string | null; successMetrics: string | null; status: string };
type Stakeholder = { id: string; name: string; role: string | null; email: string | null };

type DialogState =
  | { kind: "input"; action: "domain" | "capability" | "kpi" | "achievement" | "stakeholderName" | "stakeholderRole"; title: string; placeholder: string; value: string; domainId?: string }
  | { kind: "confirm"; action: "deleteDomain" | "deleteCapability"; title: string; message: string; domainId?: string; targetId: string };

type Org = {
  id: string;
  name: string;
  industry: string | null;
  size: string | null;
  notes: string | null;
  domains: Domain[];
  kpis: KPI[];
  achievements: Achievement[];
  stakeholders: Stakeholder[];
};

export default function ConfigurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [org, setOrg] = useState<Org | null>(null);
  const [tab, setTab] = useState<"domains" | "kpis" | "achievements" | "stakeholders">("domains");
  const [loading, setLoading] = useState(true);
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    fetch(`/api/clients/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setOrg(data);
        if (data.domains?.length > 0) setExpandedDomain(data.domains[0].id);
        setLoading(false);
      });
  }, [id]);

  async function addDefaultDomains() {
    if (!org) return;
    for (let i = 0; i < DEFAULT_DOMAINS.length; i++) {
      const d = DEFAULT_DOMAINS[i];
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: id, name: d.name, color: d.color, order: i }),
      });
      const domain = await res.json();
      setOrg((prev) => prev ? { ...prev, domains: [...prev.domains, { ...domain, capabilities: [] }] } : prev);
    }
  }

  async function addDomain(name: string) {
    if (!name.trim()) return;
    const color = DOMAIN_COLORS[(org?.domains.length ?? 0) % DOMAIN_COLORS.length];
    const res = await fetch("/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: id, name: name.trim(), color, order: org?.domains.length ?? 0 }),
    });
    const domain = await res.json();
    setOrg((prev) => prev ? { ...prev, domains: [...prev.domains, { ...domain, capabilities: [] }] } : prev);
    setExpandedDomain(domain.id);
  }

  async function deleteDomain(domainId: string) {
    await fetch(`/api/domains/${domainId}`, { method: "DELETE" });
    setOrg((prev) => prev ? { ...prev, domains: prev.domains.filter((d) => d.id !== domainId) } : prev);
  }

  async function addCapability(domainId: string, name: string) {
    if (!name.trim()) return;
    const domain = org?.domains.find((d) => d.id === domainId);
    const res = await fetch("/api/capabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domainId, name: name.trim(), order: domain?.capabilities.length ?? 0 }),
    });
    const cap = await res.json();
    setOrg((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        domains: prev.domains.map((d) =>
          d.id === domainId ? { ...d, capabilities: [...d.capabilities, cap] } : d
        ),
      };
    });
  }

  async function deleteCapability(domainId: string, capId: string) {
    await fetch(`/api/capabilities/${capId}`, { method: "DELETE" });
    setOrg((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        domains: prev.domains.map((d) =>
          d.id === domainId
            ? { ...d, capabilities: d.capabilities.filter((c) => c.id !== capId) }
            : d
        ),
      };
    });
  }

  async function updateCapabilityField(capId: string, field: string, value: unknown) {
    const cap = org?.domains.flatMap((d) => d.capabilities).find((c) => c.id === capId);
    if (!cap) return;
    const updated = { ...cap, [field]: value };
    await fetch(`/api/capabilities/${capId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    setOrg((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        domains: prev.domains.map((d) => ({
          ...d,
          capabilities: d.capabilities.map((c) => c.id === capId ? { ...c, [field]: value } : c),
        })),
      };
    });
  }

  async function addKPI(name: string) {
    if (!name.trim()) return;
    const res = await fetch("/api/kpis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: id, name: name.trim() }),
    });
    const kpi = await res.json();
    setOrg((prev) => prev ? { ...prev, kpis: [...prev.kpis, kpi] } : prev);
  }

  async function deleteKPI(kpiId: string) {
    await fetch(`/api/kpis/${kpiId}`, { method: "DELETE" });
    setOrg((prev) => prev ? { ...prev, kpis: prev.kpis.filter((k) => k.id !== kpiId) } : prev);
  }

  async function addAchievement(desc: string) {
    if (!desc.trim()) return;
    const res = await fetch("/api/achievements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: id, description: desc.trim() }),
    });
    const ach = await res.json();
    setOrg((prev) => prev ? { ...prev, achievements: [...prev.achievements, ach] } : prev);
  }

  async function deleteAchievement(achId: string) {
    await fetch(`/api/achievements/${achId}`, { method: "DELETE" });
    setOrg((prev) => prev ? { ...prev, achievements: prev.achievements.filter((a) => a.id !== achId) } : prev);
  }

  async function addStakeholder(name: string, role: string) {
    if (!name.trim()) return;
    const res = await fetch("/api/stakeholders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: id, name: name.trim(), role }),
    });
    const sh = await res.json();
    setOrg((prev) => prev ? { ...prev, stakeholders: [...prev.stakeholders, sh] } : prev);
  }

  async function deleteStakeholder(shId: string) {
    await fetch(`/api/stakeholders/${shId}`, { method: "DELETE" });
    setOrg((prev) => prev ? { ...prev, stakeholders: prev.stakeholders.filter((s) => s.id !== shId) } : prev);
  }

  function openInput(action: Extract<DialogState, { kind: "input" }>["action"], title: string, placeholder: string, domainId?: string) {
    setDialog({ kind: "input", action, title, placeholder, value: "", domainId });
  }

  function openDelete(action: "deleteDomain" | "deleteCapability", targetId: string, message: string, domainId?: string) {
    setDialog({ kind: "confirm", action, targetId, domainId, title: "Confirm deletion", message });
  }

  async function submitDialog() {
    if (!dialog) return;
    const current = dialog;
    setDialog(null);
    if (current.kind === "confirm") {
      if (current.action === "deleteDomain") await deleteDomain(current.targetId);
      else if (current.domainId) await deleteCapability(current.domainId, current.targetId);
      return;
    }
    if (current.action === "domain") await addDomain(current.value);
    if (current.action === "capability" && current.domainId) await addCapability(current.domainId, current.value);
    if (current.action === "kpi") await addKPI(current.value);
    if (current.action === "achievement") await addAchievement(current.value);
    if (current.action === "stakeholderName" && current.value.trim()) {
      setDialog({ kind: "input", action: "stakeholderRole", title: "Add stakeholder role", placeholder: "Role or title (optional)", value: "" });
      setPendingStakeholderName(current.value.trim());
    }
    if (current.action === "stakeholderRole" && pendingStakeholderName) await addStakeholder(pendingStakeholderName, current.value);
  }

  const [pendingStakeholderName, setPendingStakeholderName] = useState("");

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--muted)]">Loading...</div>;
  if (!org) return null;

  const tabs = [
    { key: "domains", label: "Domains & Capabilities" },
    { key: "kpis", label: "KPIs" },
    { key: "achievements", label: "Target Achievements" },
    { key: "stakeholders", label: "Stakeholders" },
  ] as const;

  return (
    <div className="max-w-5xl mx-auto w-full px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--foreground)]">Configure</h1>
        <p className="text-sm text-[var(--muted)]">Set up the assessment framework for {org.name}</p>
        <Link href={`/clients/${id}/members`} className="mt-3 inline-block text-sm font-medium text-[var(--accent)] hover:underline">Manage organisation members and roles →</Link>
      </div>

      <div className="flex gap-1 mb-6 bg-[var(--muted-bg)] p-1 rounded-lg w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-white text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "domains" && (
        <div>
          {org.domains.length === 0 && (
            <div className="bg-white rounded-xl border border-[var(--card-border)] p-8 text-center mb-4">
              <div className="text-4xl mb-3">🗂️</div>
              <h3 className="font-semibold text-[var(--foreground)] mb-1">No domains configured</h3>
              <p className="text-sm text-[var(--muted)] mb-4">
                Start with the standard Flow State domains or create custom ones
              </p>
              <button
                onClick={addDefaultDomains}
                className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Load Standard Domains
              </button>
            </div>
          )}

          <div className="space-y-3 mb-4">
            {org.domains.map((domain) => (
              <div key={domain.id} className="bg-white rounded-xl border border-[var(--card-border)] overflow-hidden">
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-[var(--muted-bg)] transition-colors"
                  onClick={() => setExpandedDomain(expandedDomain === domain.id ? null : domain.id)}
                >
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: domain.color ?? "#94a3b8" }} />
                  <span className="font-medium text-[var(--foreground)] flex-1">{domain.name}</span>
                  <span className="text-xs text-[var(--muted)]">{domain.capabilities.length} capabilities</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); openDelete("deleteDomain", domain.id, "Delete this domain and all its capabilities?"); }}
                    className="text-xs text-[var(--destructive)] hover:underline px-2"
                  >
                    Delete
                  </button>
                  <span className="text-[var(--muted)]">{expandedDomain === domain.id ? "▲" : "▼"}</span>
                </div>

                {expandedDomain === domain.id && (
                  <div className="border-t border-[var(--card-border)] p-4">
                    <div className="space-y-2 mb-3">
                      {domain.capabilities.length === 0 ? (
                        <p className="text-sm text-[var(--muted)] italic">No capabilities yet</p>
                      ) : (
                        domain.capabilities.map((cap) => (
                          <div key={cap.id} className="flex items-start gap-3 p-3 bg-[var(--muted-bg)] rounded-lg">
                            <div className="flex-1">
                              <div className="font-medium text-sm text-[var(--foreground)]">{cap.name}</div>
                              {cap.description && (
                                <div className="text-xs text-[var(--muted)] mt-0.5">{cap.description}</div>
                              )}
                              <div className="flex items-center gap-3 mt-2">
                                <label className="text-xs text-[var(--muted)]">Importance:</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={cap.importanceScore ?? 5}
                                  onChange={(e) => updateCapabilityField(cap.id, "importanceScore", parseFloat(e.target.value))}
                                  className="w-16 px-2 py-0.5 border border-[var(--card-border)] rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                                />
                                <label className="text-xs text-[var(--muted)]">Tags:</label>
                                <input
                                  type="text"
                                  defaultValue={cap.tags?.join(", ") ?? ""}
                                  onBlur={(e) =>
                                    updateCapabilityField(
                                      cap.id,
                                      "tags",
                                      e.target.value.split(",").map((t) => t.trim()).filter(Boolean)
                                    )
                                  }
                                  placeholder="Strength, Culture, Legal..."
                                  className="flex-1 px-2 py-0.5 border border-[var(--card-border)] rounded text-xs focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                                />
                              </div>
                            </div>
                            <button
                              onClick={() => openDelete("deleteCapability", cap.id, "Delete this capability?", domain.id)}
                              className="text-xs text-[var(--destructive)] hover:underline shrink-0"
                            >
                              Delete
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    <button
                      onClick={() => { setExpandedDomain(domain.id); openInput("capability", "Add capability", "Capability name", domain.id); }}
                      className="text-sm text-[var(--accent)] hover:underline font-medium"
                    >
                      + Add Capability
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => openInput("domain", "Add domain", "Domain name")}
            className="px-4 py-2 border border-dashed border-[var(--card-border)] text-sm text-[var(--muted)] rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors w-full"
          >
            + Add Custom Domain
          </button>
        </div>
      )}

      {tab === "kpis" && (
        <div>
          <div className="space-y-2 mb-4">
            {org.kpis.length === 0 ? (
              <div className="bg-white rounded-xl border border-[var(--card-border)] p-8 text-center text-sm text-[var(--muted)]">
                No KPIs added yet
              </div>
            ) : (
              org.kpis.map((kpi) => (
                <div key={kpi.id} className="bg-white rounded-xl border border-[var(--card-border)] p-4 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="font-medium text-sm text-[var(--foreground)]">{kpi.name}</div>
                    {kpi.description && <div className="text-xs text-[var(--muted)]">{kpi.description}</div>}
                    <div className="flex gap-4 mt-1 text-xs text-[var(--muted)]">
                      {kpi.currentValue && <span>Current: {kpi.currentValue}</span>}
                      {kpi.targetValue && <span>Target: {kpi.targetValue}</span>}
                      {kpi.measurementFrequency && <span>{kpi.measurementFrequency}</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteKPI(kpi.id)} className="text-xs text-[var(--destructive)] hover:underline">Delete</button>
                </div>
              ))
            )}
          </div>
          <button
            onClick={() => openInput("kpi", "Add KPI", "KPI name")}
            className="px-4 py-2 border border-dashed border-[var(--card-border)] text-sm text-[var(--muted)] rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors w-full"
          >
            + Add KPI
          </button>
        </div>
      )}

      {tab === "achievements" && (
        <div>
          <div className="space-y-2 mb-4">
            {org.achievements.length === 0 ? (
              <div className="bg-white rounded-xl border border-[var(--card-border)] p-8 text-center text-sm text-[var(--muted)]">
                No target achievements added yet
              </div>
            ) : (
              org.achievements.map((ach) => (
                <div key={ach.id} className="bg-white rounded-xl border border-[var(--card-border)] p-4 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="font-medium text-sm text-[var(--foreground)]">{ach.description}</div>
                    <div className="flex gap-4 mt-1 text-xs text-[var(--muted)]">
                      <span>Priority: {ach.priority}/10</span>
                      {ach.targetDate && <span>Target: {new Date(ach.targetDate).toLocaleDateString()}</span>}
                      <span className={`font-medium ${ach.status === "achieved" ? "text-[var(--success)]" : "text-[var(--muted)]"}`}>
                        {ach.status}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => deleteAchievement(ach.id)} className="text-xs text-[var(--destructive)] hover:underline">Delete</button>
                </div>
              ))
            )}
          </div>
          <button
            onClick={() => openInput("achievement", "Add target achievement", "Achievement or target outcome")}
            className="px-4 py-2 border border-dashed border-[var(--card-border)] text-sm text-[var(--muted)] rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors w-full"
          >
            + Add Target Achievement
          </button>
        </div>
      )}

      {tab === "stakeholders" && (
        <div>
          <div className="space-y-2 mb-4">
            {org.stakeholders.length === 0 ? (
              <div className="bg-white rounded-xl border border-[var(--card-border)] p-8 text-center text-sm text-[var(--muted)]">
                No stakeholders added yet
              </div>
            ) : (
              org.stakeholders.map((sh) => (
                <div key={sh.id} className="bg-white rounded-xl border border-[var(--card-border)] p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-[var(--primary)]">
                      {sh.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm text-[var(--foreground)]">{sh.name}</div>
                    {sh.role && <div className="text-xs text-[var(--muted)]">{sh.role}</div>}
                    {sh.email && <div className="text-xs text-[var(--muted)]">{sh.email}</div>}
                  </div>
                  <button onClick={() => deleteStakeholder(sh.id)} className="text-xs text-[var(--destructive)] hover:underline">Delete</button>
                </div>
              ))
            )}
          </div>
          <button
            onClick={() => openInput("stakeholderName", "Add stakeholder", "Stakeholder name")}
            className="px-4 py-2 border border-dashed border-[var(--card-border)] text-sm text-[var(--muted)] rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors w-full"
          >
            + Add Stakeholder
          </button>
        </div>
      )}
      {dialog && (
        <FlowstateDialog
          kind={dialog.kind}
          title={dialog.title}
          message={dialog.kind === "confirm" ? dialog.message : undefined}
          value={dialog.kind === "input" ? dialog.value : undefined}
          placeholder={dialog.kind === "input" ? dialog.placeholder : undefined}
          confirmLabel={dialog.kind === "confirm" ? "Delete" : "Continue"}
          destructive={dialog.kind === "confirm"}
          onChange={(value) => setDialog((current) => current?.kind === "input" ? { ...current, value } : current)}
          onCancel={() => setDialog(null)}
          onConfirm={submitDialog}
        />
      )}
    </div>
  );
}
