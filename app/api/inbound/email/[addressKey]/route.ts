import { NextRequest, NextResponse, after } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { processCapturedInput } from "@/lib/ingestion/pipeline";
import { normalizeInboundEmail } from "@/lib/ingestion/inbound-email";

export async function POST(req: NextRequest, { params }: { params: Promise<{ addressKey: string }> }) {
  const { addressKey } = await params;
  const endpoint = await prisma.inboundEmailEndpoint.findUnique({ where: { addressKey } });
  if (!endpoint || !endpoint.active) return NextResponse.json({ error: "Inbound address not found" }, { status: 404 });
  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const suppliedHash = createHash("sha256").update(token).digest();
  const expectedHash = Buffer.from(endpoint.tokenHash, "hex");
  if (!token || suppliedHash.length !== expectedHash.length || !timingSafeEqual(suppliedHash, expectedHash)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const email = normalizeInboundEmail(await req.json());
    const idempotencyKey = `${addressKey}:${email.messageId}`;
    const existing = await prisma.capturedInput.findFirst({ where: { organizationId: endpoint.organizationId, idempotencyKey }, select: { id: true, status: true } });
    if (existing) return NextResponse.json({ id: existing.id, status: existing.status, duplicate: true }, { status: 200 });
    const senderKnown = (await prisma.stakeholder.findFirst({ where: { organizationId: endpoint.organizationId, email: { equals: email.senderEmail, mode: "insensitive" } }, select: { id: true } })) || (await prisma.userOrganization.findFirst({ where: { organizationId: endpoint.organizationId, user: { email: { equals: email.senderEmail, mode: "insensitive" } } }, select: { id: true } }));
    const input = await prisma.capturedInput.create({ data: { organizationId: endpoint.organizationId, type: "EMAIL", sourceRef: email.messageId, senderEmail: email.senderEmail, senderName: email.senderName, subject: email.subject, idempotencyKey, rawText: email.rawText, status: senderKnown ? "TRANSCRIBED" : "QUARANTINED", quarantineReason: senderKnown ? null : "Unknown sender" , attachments: { create: email.attachments } } });
    if (senderKnown) after(() => processCapturedInput(input.id));
    return NextResponse.json({ id: input.id, status: input.status, quarantined: !senderKnown }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid inbound email" }, { status: 400 }); }
}
