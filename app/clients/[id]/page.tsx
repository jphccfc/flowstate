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
    { href: `/clients/${id}/configure`, label: "Configure", icon: "⚙️", desc: "Set up domains, capabilities, KPIs, and target achievements", cta: "Configure" },
    { href: `/clients/${id}/assess`, label: "Assess", icon: "📋", desc: "Run a live capability assessment interview", cta: "Start / Continue Assessment" },
    { href: `/clients/${id}/analysis`, label: "Analysis", icon: "📊", desc: "View gap analysis, radar charts, and capability heatmaps", cta: "View Analysis" },
    { href: `/clients/${id}/report`, label: "Report", icon: "📄", desc: "Generate an executive summary and growth plan", cta: "View Report" },
    { href: `/clients/${id}/recommendations`, label: "Recommendations", icon: "💡", desc: "Create and review improvement recommendations", cta: "Review Recommendations" },
    { href: `/clients/${id}/review`, label: "Tag Review", icon: "🏷️", desc: "Approve, reject, or reassign extracted tags", cta: "Review Tags" },
  ];

  return (
    <main className="max-w-5xl mx-auto w-full px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{org.name}</h1>
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
          <div key={stat.label} className="bg-white rounded-xl border border-[var(--card-border)] p-4">
            <div className="text-2xl font-bold text-[var(--primary)]">{stat.value}</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-white rounded-xl border border-[var(--card-border)] p-6 hover:shadow-md transition-all hover:border-[var(--accent)] group"
          >
            <div className="text-3xl mb-3">{card.icon}</div>
            <div className="font-semibold text-[var(--foreground)] mb-1">{card.label}</div>
            <div className="text-sm text-[var(--muted)] mb-3">{card.desc}</div>
            <div className="text-sm font-medium text-[var(--accent)] group-hover:underline">{card.cta} →</div>
          </Link>
        ))}
      </div>

      {org.domains.length > 0 && (
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-6">
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
