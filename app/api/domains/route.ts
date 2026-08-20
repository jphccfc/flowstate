import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { organizationId, name, description, color, order } = body;
  if (!(await isOrganizationMember(user.email, organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const domain = await prisma.businessDomain.create({
    data: { organizationId, name, description, color, order: order ?? 0 },
  });

  return NextResponse.json(domain, { status: 201 });
}
