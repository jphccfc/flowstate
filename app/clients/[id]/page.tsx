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

  const [pendingReviewCaptures, processingCaptures, failedCaptures, openAssessmentTasks, openPlanningItems, activeGrowthActions, assessedRows] = await Promise.all([
    prisma.capturedInput.count({ where: { organizationId: id, segments: { some: { tags: { some: { status: "PENDING_REVIEW" } } } } } }),
    prisma.capturedInput.count({ where: { organizationId: id, status: { in: ["PENDING", "TRANSCRIBING", "SEGMENTING", "TAGGING"] } } }),
    prisma.capturedInput.count({ where: { organizationId: id, status: "FAILED" } }),
    prisma.assessmentTask.count({ where: { organizationId: id, status: { in: ["OPEN", "AWAITING_INPUT", "IN_PROGRESS", "BLOCKED"] } } }),
    prisma.planningItem.count({ where: { organizationId: id, lifecycleStatus: { not: "COMPLETED" } } }),
    prisma.growthAction.count({ where: { insight: { capability: { domain: { organizationId: id } } }, status: { in: ["PLANNED", "IN_PROGRESS"] } } }),
    prisma.maturityAssessment.findMany({
      where: { capability: { domain: { organizationId: id } } },
      distinct: ["capabilityId"],
      select: { capabilityId: true },
    }),
  ]);
  const assessedCapabilityIds = new Set(assessedRows.map((r) => r.capabilityId));

  const totalCapabilities = org.domains.reduce((sum, d) => sum + d.capabilities.length, 0);
  const assessedCapabilities = org.domains.reduce(
    (sum, d) => sum + d.capabilities.filter((c) => assessedCapabilityIds.has(c.id)).length,
    0
  );

  const cards = [
    { href: `/clients/${id}/capture`, label: "Capture evidence", desc: "Upload and capture traceable evidence for this client", cta: "Open capture evidence" },
    { href: `/clients/${id}/configure`, label: "Blueprint", desc: "Set up domains, capabilities, KPIs, and target achievements", cta: "Configure blueprint" },
    { href: `/clients/${id}/assess`, label: "Assessment", desc: "Run a guided capability assessment interview", cta: "Start / continue assessment" },
    { href: `/clients/${id}/tasks`, label: "Assessment tasks", desc: "Raise and manage the operational work needed to complete this assessment", cta: "Open assessment tasks" },
    { href: `/clients/${id}/analysis`, label: "Insights", desc: "View gaps, domain scores, and capability evidence", cta: "View insights" },
    { href: `/clients/${id}/report`, label: "Reports", desc: "Read executive outcomes, evidence, and approved priorities", cta: "View reports" },
    { href: `/clients/${id}/recommendations`, label: "Growth plan", desc: "Manage strategic initiatives and their reviewed recommendations", cta: "Open growth plan" },
    { href: `/clients/${id}/review`, label: "Review queue", desc: "Approve, reject, or reassign extracted tags", cta: "Open review queue" },
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
            <div className="workspace-stat-value text-2xl font-bold">{stat.value}</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      <section className="workspace-card p-6 mb-8" aria-labelledby="progress-summary-title">
        <div className="workspace-eyebrow mb-2">Work in progress</div>
        <h2 id="progress-summary-title" className="font-semibold text-[var(--foreground)] mb-1">Progress summary</h2>
        <p className="text-sm text-[var(--muted)] mb-4">A live view of work waiting for review or action in this organisation.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { href: `/clients/${id}/review`, label: "Captures needing review", value: pendingReviewCaptures, detail: "Tags awaiting human review" },
            { href: `/clients/${id}/capture`, label: "Processing or failed captures", value: processingCaptures + failedCaptures, detail: `${processingCaptures} processing · ${failedCaptures} failed` },
            { href: `/clients/${id}/assess`, label: "Assessment progress", value: `${assessedCapabilities}/${totalCapabilities}`, detail: "Capabilities assessed" },
            { href: `/clients/${id}/tasks`, label: "Open assessment tasks", value: openAssessmentTasks, detail: "Operational tasks still open" },
            { href: `/clients/${id}/planning`, label: "Planning items", value: openPlanningItems, detail: "Items not yet completed" },
            { href: `/clients/${id}/recommendations`, label: "Growth Plan actions", value: activeGrowthActions, detail: "Planned or in progress" },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg border border-[var(--card-border)] bg-[var(--muted-bg)] p-4 transition-colors hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
              <div className="text-sm font-medium text-[var(--foreground)]">{item.label}</div>
              <div className="workspace-stat-value mt-2 text-2xl font-bold" aria-label={`${item.value} ${item.label}`}>{item.value}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">{item.detail}</div>
              <div className="mt-3 text-xs font-medium text-[var(--accent)]">Open workflow <span aria-hidden="true">→</span></div>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="workflow-areas-title" className="mb-8">
        <div className="workspace-eyebrow mb-2">Client workflows</div>
        <h2 id="workflow-areas-title" className="font-semibold text-[var(--foreground)] mb-3">Workflow areas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="workspace-card p-5 sm:p-6 transition-all group" aria-label={`Workflow: ${card.label}`}
          >
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)] mb-3">Workflow</div>
            <div className="font-semibold text-[var(--foreground)] mb-1">{card.label}</div>
            <div className="text-sm text-[var(--muted)] mb-3">{card.desc}</div>
            <div className="text-sm font-medium text-[var(--accent)] group-hover:underline">{card.cta} →</div>
          </Link>
        ))}
        </div>
      </section>

      <section className="workspace-card p-6 mb-8" aria-labelledby="flowstate-process-title">
        <div className="workspace-eyebrow mb-2">Flowstate methodology</div>
        <h2 id="flowstate-process-title" className="font-semibold text-[var(--foreground)] mb-3">Evidence to outcome</h2>
        <p className="text-sm text-[var(--muted)] mb-4">Evidence is reviewed into assessment decisions, then translated into strategic Growth Plan initiatives and measurable business outcomes.</p>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--foreground)]" aria-label="Flowstate process">
          {"Evidence → Assessment → Decision → Planning Items → Growth Plan → Outcome".split(" → ").map((step, index, steps) => (
            <span key={step} className="flex items-center gap-2">
              <span className="rounded-full border border-[var(--card-border)] bg-[var(--muted-bg)] px-3 py-1.5">{step}</span>
              {index < steps.length - 1 && <span className="text-[var(--muted)]" aria-hidden="true">→</span>}
            </span>
          ))}
        </div>
        <p className="text-xs text-[var(--muted)] mt-4">Outcome scenarios: Profit / sale / liquidation</p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8" aria-label="Planning workstreams">
        <div className="workspace-card p-6">
          <div className="workspace-eyebrow mb-3">Operational workflow</div>
          <h2 className="font-semibold text-[var(--foreground)] mb-1">Assessment tasks</h2>
          <p className="text-sm text-[var(--muted)] mb-3">Operational work required to complete the assessment: evidence requests, interviews, validation, review, sign-off, and report preparation.</p>
          <Link href={`/clients/${id}/tasks`} className="text-sm font-medium text-[var(--accent)] hover:underline">Raise assessment task →</Link>
        </div>
        <div className="workspace-card p-6">
          <div className="workspace-eyebrow mb-3">Planning workflow</div>
          <h2 className="font-semibold text-[var(--foreground)] mb-1">Planning items</h2>
          <p className="text-sm text-[var(--muted)] mb-3">Turn approved insights into requirements, specifications, goals and objectives before creating strategic Growth Plan initiatives.</p>
          <Link href={`/clients/${id}/planning`} className="text-sm font-medium text-[var(--accent)] hover:underline">Open planning items →</Link>
        </div>
        <div className="workspace-card p-6">
          <div className="workspace-eyebrow mb-3">Strategic workflow</div>
          <h2 className="font-semibold text-[var(--foreground)] mb-1">Growth plan</h2>
          <p className="text-sm text-[var(--muted)] mb-3">Strategic initiatives to improve the business outcome through capability, process, technology, profitability, sale, or restructuring work.</p>
          <Link href={`/clients/${id}/recommendations`} className="text-sm font-medium text-[var(--accent)] hover:underline">Open growth plan →</Link>
        </div>
      </section>

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
