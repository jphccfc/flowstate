import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isSystemAdmin } from "@/lib/auth/organization";
import { InputType } from "@/app/generated/prisma/client";
import { safeAgentIdentifier, validAgentInputRules } from "@/lib/agents/validation";

const identifier = safeAgentIdentifier;
async function admin() { const user = (await (await createClient()).auth.getUser()).data.user; if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }; if (!(await isSystemAdmin(user.email))) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }; return { user }; }
export async function GET() { const auth = await admin(); if ("response" in auth) return auth.response; const agents = await prisma.agentDefinition.findMany({ orderBy: { name: "asc" }, include: { promptVersions: { orderBy: { version: "asc" } }, inputRules: { orderBy: [{ inputType: "asc" }, { domainIdentifier: "asc" }] }, publishedPromptVersion: true } }); return NextResponse.json({ agents }); }
export async function POST(req: Request) { const auth = await admin(); if ("response" in auth) return auth.response; const body = await req.json().catch(() => null) as Record<string, unknown> | null; const rules = body?.inputRules ?? []; if (!body || typeof body.key !== "string" || !identifier.test(body.key) || typeof body.name !== "string" || !body.name.trim() || typeof body.prompt !== "string" || !body.prompt.trim() || typeof body.changeReason !== "string" || !body.changeReason.trim() || !validAgentInputRules(rules)) return NextResponse.json({ error: "key, name, prompt, changeReason and safe inputRules are required" }, { status: 400 });
  try { const agent = await prisma.agentDefinition.create({ data: { key: body.key, name: body.name.trim(), description: typeof body.description === "string" ? body.description : null, createdBy: auth.user.email!, promptVersions: { create: { version: 1, prompt: body.prompt.trim(), changeReason: body.changeReason.trim(), authoredBy: auth.user.email! } }, inputRules: { create: (rules as { inputType: InputType; domainIdentifier: string }[]).map((rule) => ({ inputType: rule.inputType, domainIdentifier: rule.domainIdentifier })) } }, include: { promptVersions: true, inputRules: true } }); return NextResponse.json({ agent }, { status: 201 }); } catch (error) { if ((error as { code?: string }).code === "P2002") return NextResponse.json({ error: "Agent key already exists" }, { status: 409 }); throw error; }
}
