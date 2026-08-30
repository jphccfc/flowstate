import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser(); const { id } = await params;
  if (!user || !(await hasOrganizationPermission(user.email, id, "client.read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await prisma.inboundEmailEndpoint.findUnique({ where: { organizationId: id }, select: { inboundAddress: true, active: true, createdAt: true } }));
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser(); const { id } = await params;
  if (!user || !(await hasOrganizationPermission(user.email, id, "client.configure"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const token = randomBytes(32).toString("hex"); const addressKey = randomBytes(12).toString("hex"); const domain = process.env.INBOUND_EMAIL_DOMAIN || "inbound.flowstate.local";
  const endpoint = await prisma.inboundEmailEndpoint.upsert({ where: { organizationId: id }, update: { addressKey, inboundAddress: `${addressKey}@${domain}`, tokenHash: createHash("sha256").update(token).digest("hex"), active: true }, create: { organizationId: id, addressKey, inboundAddress: `${addressKey}@${domain}`, tokenHash: createHash("sha256").update(token).digest("hex") }, select: { inboundAddress: true, addressKey: true, active: true } });
  return NextResponse.json({ ...endpoint, token, warning: "Store this token securely; it is shown once. Configure a provider separately." }, { status: 201 });
}
