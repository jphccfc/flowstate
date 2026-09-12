import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { exchangeAuthorizationCode, isOAuthStateValid } from "@/lib/integrations/microsoft-oauth";
import { OAUTH_STATE_COOKIE, verifyOAuthState } from "@/lib/integrations/oauth-state";
import { integrationSecretKey, saveConnection } from "@/lib/integrations/connection-store";
import { prisma } from "@/lib/db";

/**
 * Completes the Microsoft Entra authorization-code flow.
 *
 * Fails closed at every boundary: the signed state cookie must verify, the
 * returned state must match, and the organisation in the cookie must equal the
 * organisation in the route. Tokens are encrypted before they reach the
 * database and are never returned to the caller. Any failure redirects with an
 * error code — a connection is only recorded when the exchange genuinely
 * succeeded.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const backToIntegrations = new URL(`/clients/${id}/integrations/sharepoint`, request.nextUrl.origin);

  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(user.email, id, "client.configure"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fail = (code: string) => {
    const target = new URL(backToIntegrations);
    target.searchParams.set("sharepoint", code);
    return NextResponse.redirect(target);
  };

  let key: string;
  try {
    key = integrationSecretKey();
  } catch {
    return NextResponse.json({ error: "Integration secret key is not configured" }, { status: 500 });
  }

  const cookieValue = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  let payload;
  try {
    payload = verifyOAuthState(cookieValue ?? "", key);
  } catch {
    return fail("state_invalid");
  }

  if (payload.organizationId !== id) return fail("organization_mismatch");

  const returnedState = request.nextUrl.searchParams.get("state");
  if (!isOAuthStateValid(returnedState, payload.state)) return fail("state_mismatch");

  if (request.nextUrl.searchParams.get("error")) return fail("consent_denied");

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return fail("code_missing");

  const clientSecret = process.env.MICROSOFT_ENTRA_CLIENT_SECRET;
  if (!clientSecret) return fail("not_configured");

  let tokens;
  try {
    tokens = await exchangeAuthorizationCode({
      code,
      clientId: process.env.MICROSOFT_ENTRA_CLIENT_ID as string,
      tenantId: process.env.MICROSOFT_ENTRA_TENANT_ID as string,
      redirectUri: process.env.MICROSOFT_ENTRA_REDIRECT_URI as string,
      clientSecret,
    });
  } catch {
    // Never surface provider detail (or anything token-shaped) to the browser.
    return fail("exchange_failed");
  }

  try {
    await saveConnection(prisma, {
      organizationId: id,
      tokens,
      accountEmail: user.email,
      externalTenantId: process.env.MICROSOFT_ENTRA_TENANT_ID ?? null,
    });
  } catch {
    return fail("persist_failed");
  }

  const target = new URL(backToIntegrations);
  target.searchParams.set("sharepoint", "connected");
  const response = NextResponse.redirect(target);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}
