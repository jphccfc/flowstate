import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberships = await prisma.stakeholderPortalMembership.findMany({
    where: { user: { email: user.email } },
    select: { role: true, stakeholder: { select: { organization: { select: { id: true, name: true } } } } },
  });
  const organisations = Array.from(new Map(memberships.map(membership => [membership.stakeholder.organization.id, {
    ...membership.stakeholder.organization,
    roles: [membership.role],
  }])).values());
  return NextResponse.json(organisations);
}
