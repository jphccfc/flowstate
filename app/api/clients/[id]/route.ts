import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";
import { getCurrentMaturityForOrganization } from "@/lib/maturity/current";
import { getCurrentTargetMaturityForOrganization } from "@/lib/maturity/target";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      domains: {
        orderBy: { order: "asc" },
        include: {
          capabilities: { orderBy: { order: "asc" } },
        },
      },
      stakeholders: { orderBy: { name: "asc" } },
      kpis: { orderBy: { name: "asc" } },
      achievements: { orderBy: { priority: "desc" } },
      sessions: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isOrganizationMember(user.email, org.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [currentAsIs, currentToBe] = await Promise.all([
    getCurrentMaturityForOrganization(id),
    getCurrentTargetMaturityForOrganization(id),
  ]);

  const asIsByCapability = new Map<string, { locationTag: string | null; score: number }[]>();
  for (const row of currentAsIs) {
    const list = asIsByCapability.get(row.capabilityId) ?? [];
    list.push({ locationTag: row.locationTag, score: row.score });
    asIsByCapability.set(row.capabilityId, list);
  }
  const toBeByCapability = new Map<string, { locationTag: string | null; score: number }[]>();
  for (const row of currentToBe) {
    const list = toBeByCapability.get(row.capabilityId) ?? [];
    list.push({ locationTag: row.locationTag, score: row.score });
    toBeByCapability.set(row.capabilityId, list);
  }

  const enriched = {
    ...org,
    domains: org.domains.map((domain) => ({
      ...domain,
      capabilities: domain.capabilities.map((cap) => ({
        ...cap,
        currentAsIs: asIsByCapability.get(cap.id) ?? [],
        currentToBe: toBeByCapability.get(cap.id) ?? [],
      })),
    })),
  };

  return NextResponse.json(enriched);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.organization.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isOrganizationMember(user.email, existing.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const org = await prisma.organization.update({
    where: { id },
    data: {
      name: body.name,
      industry: body.industry,
      size: body.size,
      notes: body.notes,
      engagementMotive: body.engagementMotive,
    },
  });

  return NextResponse.json(org);
}
