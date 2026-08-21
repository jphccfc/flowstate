export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ClientOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      domains: {
        include: { capabilities: true },
        orderBy: { order: "asc" },
      },
      sessions: { orderBy: { createdAt: "desc" }, take: 3 },
      _count: { select: { kpis: true, achievements: true, stakeholders: true } },
    },
  });

  if (!org) notFound();

  const assessedRows = await prisma.maturityAssessment.findMany({
    where: { capability: { domain: { organizationId: id } } },
    distinct: ["capabilityId"],
    select: { capabilityId: true },
  });
  const assessedCapabilityIds = new Set(assessedRows.map((r) => r.capabilityId));

  const totalCapabilities = org.domains.reduce((sum, d) => sum + d.capabilities.length, 0);
  const assessedCapabilities = org.domains.reduce(
    (sum, d) => sum + d.capabilities.filter((c) => assessedCapabilityIds.has(c.id)).length,
    0
  );

  const cards = [
    { href: `/clients/${id}/configure`, label: "Blueprint", icon: "02", desc: "Set up domains, capabilities, KPIs, and target achievements", cta: "Configure blueprint" },
    { href: `/clients/${id}/assess`, label: "Assessment", icon: "03", desc: "Run a guided capability assessment interview", cta: "Start / continue assessment" },
    { href: `/clients/${id}/analysis`, label: "Insights", icon: "04", desc: "View gaps, domain scores, and capability evidence", cta: "View insights" },
    { href: `/clients/${id}/report`, label: "Reports", icon: "05", desc: "Generate an executive summary and growth plan", cta: "View reports" },
    { href: `/clients/${id}/recommendations`, label: "Growth plan", icon: "06", desc: "Create, submit, and review improvement recommendations", cta: "Open growth plan" },
    { href: `/clients/${id}/review`, label: "Review queue", icon: "07", desc: "Approve, reject, or reassign extracted tags", cta: "Open review queue" },
  ];

  return (
    <main className="max-w-5xl mx-auto w-full px-4 py-8">
      <div className="mb-8">
        <div className="workspace-eyebrow mb-2">Business capability workspace</div>
        <h1 className="workspace-heading text-3xl font-bold text-[var(--foreground)]">{org.name}</h1>
        <div className="flex items-center gap-3 mt-1 text-sm text-[var(--muted)]">
          {org.industry && <span>{org.industry}</span>}
          {org.size && <><span>·</span><span>{org.size}</span></>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Domains", value: org.domains.length },
          { label: "Capabilities", value: totalCapabilities },
          { label: "Assessed", value: `${assessedCapabilities}/${totalCapabilities}` },
          { label: "KPIs", value: org._count.kpis },
        ].map((stat) => (
          <div key={stat.label} className="workspace-card workspace-stat p-4">
            <div className="text-2xl font-bold text-[var(--primary)]">{stat.value}</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="workspace-card p-6 transition-all group"
          >
            <div className="workspace-nav-icon mb-4 text-sm">{card.icon}</div>
            <div className="font-semibold text-[var(--foreground)] mb-1">{card.label}</div>
            <div className="text-sm text-[var(--muted)] mb-3">{card.desc}</div>
            <div className="text-sm font-medium text-[var(--accent)] group-hover:underline">{card.cta} →</div>
          </Link>
        ))}
      </div>

      {org.domains.length > 0 && (
        <div className="workspace-card p-6">
          <h2 className="font-semibold text-[var(--foreground)] mb-4">Domains Overview</h2>
          <div className="space-y-2">
            {org.domains.map((domain) => {
              const assessed = domain.capabilities.filter((c) => assessedCapabilityIds.has(c.id)).length;
              const pct = domain.capabilities.length > 0
                ? Math.round((assessed / domain.capabilities.length) * 100)
                : 0;
              return (
                <div key={domain.id} className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: domain.color ?? "#94a3b8" }}
                  />
                  <span className="text-sm text-[var(--foreground)] flex-1 min-w-0 truncate">
                    {domain.name}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {assessed}/{domain.capabilities.length} assessed
                  </span>
                  <div className="w-24 h-1.5 rounded-full bg-[var(--muted-bg)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
