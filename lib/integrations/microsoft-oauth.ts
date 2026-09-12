import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Least-privilege delegated scopes for reading a client's SharePoint evidence.
 *
 * Read-only on purpose: Flowstate imports evidence into the Review workflow and
 * must never write back to the customer's Microsoft 365 tenant.
 */
export const MICROSOFT_GRAPH_SCOPES = [
  "offline_access",
  "User.Read",
  "Sites.Read.All",
  "Files.Read.All",
] as const;

export type MicrosoftAuthorizeParams = {
  clientId: string;
  tenantId: string;
  redirectUri: string;
  state: string;
};

/**
 * Builds the Entra ID v2 authorization-code URL.
 *
 * The client secret is never part of an authorization request; it is only used
 * server-to-server during the code exchange.
 */
export function buildMicrosoftAuthorizeUrl({
  clientId,
  tenantId,
  redirectUri,
  state,
}: MicrosoftAuthorizeParams): string {
  const url = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`,
  );
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_GRAPH_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

/** Opaque, single-use anti-CSRF value for the authorization round trip. */
export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export type MicrosoftTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string | null;
};

export type ExchangeParams = {
  code: string;
  clientId: string;
  tenantId: string;
  redirectUri: string;
  clientSecret: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
};

/**
 * Redeems an authorization code for tokens at the tenant token endpoint.
 *
 * The client secret travels in the request body (never the query string) and is
 * only used here, server-to-server. A non-2xx response or a missing access token
 * throws — a failed exchange must never be reported as a connected integration.
 */
export async function exchangeAuthorizationCode({
  code,
  clientId,
  tenantId,
  redirectUri,
  clientSecret,
  fetchImpl = fetch,
}: ExchangeParams): Promise<MicrosoftTokenSet> {
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: MICROSOFT_GRAPH_SCOPES.join(" "),
  });

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || payload.error) {
    const detail = [payload.error, payload.error_description].filter(Boolean).join(": ") || `HTTP ${response.status}`;
    throw new Error(`Microsoft token exchange failed: ${detail}`);
  }
  if (!payload.access_token) {
    throw new Error("Microsoft token exchange returned no access token");
  }

  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scope: payload.scope ?? null,
  };
}


/**
 * Constant-time comparison of the callback state against the value issued at
 * the start of the flow. Missing or different-length values fail closed.
 */
export function isOAuthStateValid(candidate: string | null | undefined, expected: string | null | undefined): boolean {
  if (!candidate || !expected) return false;
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
