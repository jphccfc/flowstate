import { NextRequest, NextResponse, after } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { processCapturedInput } from "@/lib/ingestion/pipeline";
import { InputType } from "@/app/generated/prisma/enums";

const VALID_TYPES = new Set<InputType>(["TEXT_NOTE", "EMAIL", "AUDIO", "DOCUMENT", "DATA_ROOM_FILE"]);
const TEXT_TYPES = new Set<InputType>(["TEXT_NOTE", "EMAIL"]);

function isInputType(value: string): value is InputType {
  return (VALID_TYPES as Set<string>).has(value);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const organizationId = formData.get("organizationId");
  const type = formData.get("type");
  const locationTag = formData.get("locationTag");
  const rawText = formData.get("rawText");
  const file = formData.get("file");

  if (typeof organizationId !== "string" || !organizationId || typeof type !== "string" || !type) {
    return NextResponse.json({ error: "organizationId and type are required" }, { status: 400 });
  }
  if (!isInputType(type)) {
    return NextResponse.json({ error: `Unsupported type: ${type}` }, { status: 400 });
  }

  const resolvedLocationTag = typeof locationTag === "string" && locationTag ? locationTag : null;
  let capturedInput;

  if (TEXT_TYPES.has(type)) {
    if (typeof rawText !== "string" || !rawText.trim()) {
      return NextResponse.json({ error: "rawText is required" }, { status: 400 });
    }
    capturedInput = await prisma.capturedInput.create({
      data: {
        organizationId,
        type,
        rawText,
        locationTag: resolvedLocationTag,
        status: "TRANSCRIBED",
      },
    });
  } else {
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const blob = await put(file.name, file, { access: "public" });
    capturedInput = await prisma.capturedInput.create({
      data: {
        organizationId,
        type,
        sourceRef: blob.url,
        locationTag: resolvedLocationTag,
        status: "PENDING",
      },
    });
  }

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
