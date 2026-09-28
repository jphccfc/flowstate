import { createHash } from "node:crypto";
import { extractFinancialSpreadsheet } from "@/lib/financial/spreadsheet-extraction";
import { NextRequest, NextResponse, after } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { canAccessClient } from "@/lib/auth/organization";
import { processCapturedInput } from "@/lib/ingestion/pipeline";
import { InputType } from "@/app/generated/prisma/enums";
import { apiError } from "@/lib/api/errors";

const VALID_TYPES = new Set<InputType>(["TEXT_NOTE", "EMAIL", "AUDIO", "DOCUMENT", "DATA_ROOM_FILE", "SPREADSHEET"]);
const TEXT_TYPES = new Set<InputType>(["TEXT_NOTE", "EMAIL"]);
const DOCUMENT_EXTENSIONS = new Set(["pdf", "docx"]);
const SPREADSHEET_EXTENSIONS = new Set(["csv", "xlsx"]);

function isInputType(value: string): value is InputType {
  return (VALID_TYPES as Set<string>).has(value);
}

export async function POST(req: NextRequest) {
  try {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const organizationId = formData.get("organizationId");
    const type = formData.get("type");
    const locationTag = formData.get("locationTag");
    const rawText = formData.get("rawText");
    const file = formData.get("file");
    const sessionIdField = formData.get("sessionId");
    const meetingContextIdField = formData.get("meetingContextId");

    if (typeof organizationId !== "string" || !organizationId || typeof type !== "string" || !type) {
      return NextResponse.json({ error: "organizationId and type are required" }, { status: 400 });
    }
    if (!(await canAccessClient(user.email, organizationId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!isInputType(type)) {
      return NextResponse.json({ error: `Unsupported type: ${type}` }, { status: 400 });
    }

    const sessionId = typeof sessionIdField === "string" && sessionIdField ? sessionIdField : null;
    const meetingContextId = typeof meetingContextIdField === "string" && meetingContextIdField ? meetingContextIdField : null;
    if (meetingContextId) {
      const context = await prisma.meetingContext.findUnique({ where: { id: meetingContextId }, select: { organizationId: true } });
      if (!context || context.organizationId !== organizationId) return NextResponse.json({ error: "Meeting context not found" }, { status: 404 });
    }
    if (sessionId) {
      const session = await prisma.assessmentSession.findUnique({ where: { id: sessionId }, select: { organizationId: true, status: true } });
      if (!session || session.organizationId !== organizationId) return NextResponse.json({ error: "Live session not found" }, { status: 404 });
      if (session.status !== "active") return NextResponse.json({ error: "Live session is not active" }, { status: 400 });
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
          sessionId,
          meetingContextId,
          status: "TRANSCRIBED",
        },
      });
    } else {
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file is required" }, { status: 400 });
      }
      if (type === "DOCUMENT") {
        const extension = file.name.split(".").pop()?.toLowerCase();
        if (!extension || !DOCUMENT_EXTENSIONS.has(extension)) {
          return NextResponse.json({ error: "Documents must be PDF or DOCX files" }, { status: 400 });
        }
      }
      if (type === "SPREADSHEET") {
        const extension = file.name.split(".").pop()?.toLowerCase();
        if (!extension || !SPREADSHEET_EXTENSIONS.has(extension)) {
          return NextResponse.json({ error: "Spreadsheets must be CSV or XLSX files while legacy XLS parsing is under controlled rollout" }, { status: 400 });
        }
      }
      if (type === "SPREADSHEET") {
        // Financial workbooks are deliberately parsed while their bytes are in
        // memory. We retain values, cell provenance and a hash—not a second
        // copy of the client workbook in Blob storage.
        const bytes = Buffer.from(await file.arrayBuffer());
        const workbook = await extractFinancialSpreadsheet(bytes, file.name);
        const rawText = workbook.sheets.flatMap((sheet) => [
          `Sheet: ${sheet.name}`,
          ...sheet.rows.map((row) => row.cells.map((cell) => `${cell.ref}=${cell.value}`).join(" | ")),
        ]).join("\n");
        capturedInput = await prisma.capturedInput.create({
          data: {
            organizationId,
            type,
            rawText,
            sourcePath: `Manual upload: ${file.name}`,
            sourceHash: createHash("sha256").update(bytes).digest("hex"),
            locationTag: resolvedLocationTag,
            sessionId,
            meetingContextId,
            status: "TRANSCRIBED",
            attachments: { create: { filename: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size } },
          },
        });
      } else {
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          return NextResponse.json(
            { error: "File storage configuration is unavailable. Please contact your administrator." },
            { status: 503 },
          );
        }
        const blob = await put(file.name, file, { access: "public", addRandomSuffix: true });
        capturedInput = await prisma.capturedInput.create({
          data: {
            organizationId,
            type,
            sourceRef: blob.url,
            locationTag: resolvedLocationTag,
            sessionId,
            meetingContextId,
            status: "PENDING",
          },
        });
      }
    }

    after(() => processCapturedInput(capturedInput.id));

    return NextResponse.json(capturedInput, { status: 201 });
  } catch (error) {
    return apiError(error, "Capture could not be submitted");
  }
}

export async function GET(req: NextRequest) {
  try {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const organizationId = new URL(req.url).searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }
  if (!(await canAccessClient(user.email, organizationId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

    const inputs = await prisma.capturedInput.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { attachments: { select: { filename: true }, take: 1 }, meetingContext: { select: { title: true } } },
    });
    return NextResponse.json(inputs);
  } catch (error) {
    return apiError(error, "Unable to load captured inputs");
  }
}
