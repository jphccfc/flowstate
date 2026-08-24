import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isSystemAdmin } from "@/lib/auth/organization";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgs = await prisma.organization.findMany({
      where: (await isSystemAdmin(user.email)) ? undefined : { users: { some: { user: { email: user.email ?? undefined } } } },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { domains: true, sessions: true } },
      },
    });

    return NextResponse.json(orgs);
  } catch (err) {
    console.error("GET /api/clients:", err);
    return NextResponse.json({ error: "Failed to load clients" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, industry, size, notes } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const org = await prisma.organization.create({
      data: { name: name.trim(), industry, size, notes },
    });

    const dbUser = await prisma.user.upsert({
      where: { email: user.email! },
      update: {},
      create: { email: user.email!, name: user.user_metadata?.name, role: "ADVISOR" },
    });

    await prisma.userOrganization.create({
      data: { userId: dbUser.id, organizationId: org.id, role: "ADVISOR" },
    });

    const responseOrg = await prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      include: { _count: { select: { domains: true, sessions: true } } },
    });

    return NextResponse.json(responseOrg, { status: 201 });
  } catch (err) {
    console.error("POST /api/clients:", err);
    return NextResponse.json(
      { error: "Failed to create client. Check database connection." },
      { status: 500 }
    );
  }
}
