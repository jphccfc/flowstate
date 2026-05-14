import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { domainId, name, description, dimensions, metrics, aliases, order } = body;

  const capability = await prisma.capability.create({
    data: {
      domainId,
      name,
      description,
      dimensions: dimensions ?? [],
      metrics: metrics ?? [],
      aliases: aliases ?? [],
      order: order ?? 0,
      importanceScore: 5,
      toBeScore: 8,
    },
  });

  return NextResponse.json(capability, { status: 201 });
}
