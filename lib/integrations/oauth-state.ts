import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, self-contained OAuth state carried in an httpOnly cookie.
 *
 * Holds which organisation and user started the flow so the callback can prove
 * the request belongs to the same session, without a database round trip and
 * without trusting client-supplied query parameters. The payload is signed with
 * the integration secret key and expires, so a captured cookie cannot be replayed
 * indefinitely.
 */

export type OAuthStatePayload = {
  organizationId: string;
  userId: string;
  state: string;
  expiresAt: number;
};

const VERSION = "v1";

function signature(keyBase64: string, data: string): string {
  return createHmac("sha256", Buffer.from(keyBase64, "base64")).update(data).digest("base64url");
}

export function signOAuthState(payload: OAuthStatePayload, keyBase64: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signed = `${VERSION}.${body}`;
  return `${signed}.${signature(keyBase64, signed)}`;
}

export function verifyOAuthState(token: string, keyBase64: string): OAuthStatePayload {
  if (!token) throw new Error("OAuth state cookie is missing");
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) throw new Error("OAuth state cookie is malformed");
  const [version, body, provided] = parts;

  const expected = signature(keyBase64, `${version}.${body}`);
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    throw new Error("OAuth state signature is invalid");
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
  } catch {
    throw new Error("OAuth state cookie is malformed");
  }

  if (!payload?.organizationId || !payload?.userId || !payload?.state) {
    throw new Error("OAuth state cookie is malformed");
  }
  if (typeof payload.expiresAt !== "number" || payload.expiresAt <= Date.now()) {
    throw new Error("OAuth state cookie has expired");
  }
  return payload;
}

export const OAUTH_STATE_COOKIE = "flowstate_sharepoint_oauth";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
