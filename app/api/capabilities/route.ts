import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { domainId, name, description, dimensions, metrics, aliases, tags, order } = body;
  const domain = await prisma.businessDomain.findUnique({ where: { id: domainId }, select: { organizationId: true } });
  if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  if (!(await isOrganizationMember(user.email, domain.organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const capability = await prisma.capability.create({
    data: {
      domainId,
      name,
      description,
      dimensions: dimensions ?? [],
      metrics: metrics ?? [],
      aliases: aliases ?? [],
      tags: tags ?? [],
      order: order ?? 0,
      importanceScore: 5,
    },
  });

  return NextResponse.json(capability, { status: 201 });
}
