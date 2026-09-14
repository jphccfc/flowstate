/**
 * Shape validation for the Microsoft 365 app-registration settings.
 *
 * Exists because a plausible-looking paste error (a web address in the client
 * id, a client secret in the tenant id) previously reached Microsoft, which
 * answered with a generic AADSTS error that says nothing about which Flowstate
 * variable is wrong. These checks turn that into an immediate, precise,
 * self-diagnosing failure at the point of use.
 *
 * NEVER includes the offending value in a message or log line: a misconfigured
 * variable is exactly the kind that can hold a secret.
 */

export type MicrosoftConfigValues = {
  clientId?: string | null;
  tenantId?: string | null;
  redirectUri?: string | null;
};

export type MicrosoftConfigProblem = {
  code: "missing" | "malformed";
  envVar: string;
  message: string;
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/i;
// Legitimate tenant identifiers that are neither GUIDs nor domains. Must not be
// rejected, or a valid configuration would be blocked by this guard.
const TENANT_ALIASES = new Set(["common", "organizations", "consumers"]);
const CLIENT_SECRET_SHAPE = /^[A-Za-z0-9]{6,12}~[A-Za-z0-9._~-]{20,}$/;
const LOOKS_LIKE_URL = /:\/\/|\//;

function check(
  envVar: string,
  raw: string | null | undefined,
  options: { allowDomain?: boolean; label: string },
): MicrosoftConfigProblem | null {
  if (!raw || !raw.trim()) {
    return {
      code: "missing",
      envVar,
      message: `${envVar} is not set. Add it in Vercel for the Production environment, then redeploy.`,
    };
  }
  const value = raw.trim();

  if (CLIENT_SECRET_SHAPE.test(value)) {
    return {
      code: "malformed",
      envVar,
      message: `${envVar} holds what looks like an Azure client secret. ${options.label} belongs here instead — the secret goes only in MICROSOFT_ENTRA_CLIENT_SECRET.`,
    };
  }
  if (LOOKS_LIKE_URL.test(value) && !GUID.test(value)) {
    return {
      code: "malformed",
      envVar,
      message: `${envVar} holds a web address, not an identifier. Copy ${options.label} from the app registration Overview page (Entra → App registrations → your app).`,
    };
  }
  if (GUID.test(value)) return null;
  if (options.allowDomain && TENANT_ALIASES.has(value.toLowerCase())) return null;
  if (options.allowDomain && DOMAIN.test(value)) return null;

  return {
    code: "malformed",
    envVar,
    message: `${envVar} is not a valid ${options.label}. Expected a GUID${
      options.allowDomain ? " or a domain such as contoso.onmicrosoft.com" : ""
    }.`,
  };
}

/** Returns the first problem found, or null when the settings are usable. */
export function describeMicrosoftConfigProblem(
  values: MicrosoftConfigValues,
): MicrosoftConfigProblem | null {
  return (
    check("MICROSOFT_ENTRA_CLIENT_ID", values.clientId, {
      label: "the Application (client) ID",
    }) ??
    check("MICROSOFT_ENTRA_TENANT_ID", values.tenantId, {
      allowDomain: true,
      label: "the Directory (tenant) ID",
    }) ??
    (() => {
      const raw = values.redirectUri;
      if (!raw || !raw.trim()) {
        return {
          code: "missing" as const,
          envVar: "MICROSOFT_ENTRA_REDIRECT_URI",
          message:
            "MICROSOFT_ENTRA_REDIRECT_URI is not set. It must match the redirect URI registered on the app exactly.",
        };
      }
      const value = raw.trim();
      if (!value.startsWith("https://")) {
        return {
          code: "malformed" as const,
          envVar: "MICROSOFT_ENTRA_REDIRECT_URI",
          message:
            "MICROSOFT_ENTRA_REDIRECT_URI must be an https:// URL, or Microsoft rejects the request.",
        };
      }
      if (value.endsWith("/")) {
        return {
          code: "malformed" as const,
          envVar: "MICROSOFT_ENTRA_REDIRECT_URI",
          message:
            "MICROSOFT_ENTRA_REDIRECT_URI has a trailing slash. Remove it: it must match the registered URI character for character.",
        };
      }
      return null;
    })()
  );
}
