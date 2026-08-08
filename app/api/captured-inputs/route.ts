import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { processCapturedInput } from "@/lib/ingestion/pipeline";

const SUPPORTED_TYPES = new Set(["TEXT_NOTE", "EMAIL"]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { organizationId, type, rawText, locationTag } = body;

  if (!organizationId || !type) {
    return NextResponse.json({ error: "organizationId and type are required" }, { status: 400 });
  }
  if (!SUPPORTED_TYPES.has(type)) {
    return NextResponse.json({ error: `Unsupported type: ${type}` }, { status: 400 });
  }
  if (!rawText?.trim()) {
    return NextResponse.json({ error: "rawText is required" }, { status: 400 });
  }

  const capturedInput = await prisma.capturedInput.create({
    data: {
      organizationId,
      type,
      rawText,
      locationTag: locationTag || null,
      status: "TRANSCRIBED",
    },
  });

  after(() => processCapturedInput(capturedInput.id));

  return NextResponse.json(capturedInput, { status: 201 });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const organizationId = new URL(req.url).searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  const inputs = await prisma.capturedInput.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(inputs);
}
