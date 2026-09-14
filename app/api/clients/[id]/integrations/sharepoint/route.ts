import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { getMicrosoft365ConnectionReadiness, previewSharePointImport, type SharePointSourceSelection } from "@/lib/integrations/sharepoint";
import { SHAREPOINT_PROVIDER, disconnect, getConnectionStatus } from "@/lib/integrations/connection-store";
import { prisma } from "@/lib/db";
async function authorize(id: string, permission: "client.read" | "client.configure") { const { data: { user } } = await (await createClient()).auth.getUser(); if (!user?.email || !(await hasOrganizationPermission(user.email, id, permission))) return null; return user; }

/**
 * Reports integration readiness AND whether a Microsoft 365 connection actually
 * exists. Readiness alone only reflects environment configuration, so the page
 * could not previously tell a connected client from one that had never started
 * the flow. Only non-secret fields are returned.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; if (!await authorize(id, "client.read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); let connection = null; try { connection = await getConnectionStatus(prisma, id, SHAREPOINT_PROVIDER); } catch { connection = null; } return NextResponse.json({ organizationId: id, ...getMicrosoft365ConnectionReadiness(), connection, sourceSelection: { site: "", library: "", folder: "" } }); }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; if (!await authorize(id, "client.configure")) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const body = await request.json().catch(() => null) as { sourceSelection?: Partial<SharePointSourceSelection> } | null; const sourceSelection = body?.sourceSelection; const selection = { site: typeof sourceSelection?.site === "string" ? sourceSelection.site.trim() : "", library: typeof sourceSelection?.library === "string" ? sourceSelection.library.trim() : "", folder: typeof sourceSelection?.folder === "string" ? sourceSelection.folder.trim() : "" }; if (![selection.site, selection.library, selection.folder].every(Boolean)) return NextResponse.json({ error: "site, library, and folder are required" }, { status: 400 }); return NextResponse.json(previewSharePointImport(id, selection)); }

/**
 * Removes the stored connection and its encrypted tokens. Needed so a client can
 * reconnect as a different Microsoft account, and so a revoked or wrong-tenant
 * grant can be cleared without database access.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; if (!await authorize(id, "client.configure")) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); try { await disconnect(prisma, id, SHAREPOINT_PROVIDER); } catch { return NextResponse.json({ error: "The connection could not be removed." }, { status: 500 }); } return NextResponse.json({ disconnected: true }); }
