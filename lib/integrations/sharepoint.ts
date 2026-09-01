import { randomBytes } from "node:crypto";

export type SharePointSourceSelection = { site: string; library: string; folder: string };
export type IntegrationConnectionState = "NotConnected" | "NotConfigured" | "Ready" | "ConnectionFailed";
export type ImportPreview = { provider: "microsoft-365"; organizationId: string; connectionState: "NotConnected"; sourceSelection: SharePointSourceSelection; itemCount: number; message: string; encryptedSecretRef: string | null };

const MICROSOFT_365_CONFIGURATION = [
  ["MICROSOFT_ENTRA_CLIENT_ID", () => process.env.MICROSOFT_ENTRA_CLIENT_ID],
  ["MICROSOFT_ENTRA_TENANT_ID", () => process.env.MICROSOFT_ENTRA_TENANT_ID],
  ["MICROSOFT_ENTRA_REDIRECT_URI", () => process.env.MICROSOFT_ENTRA_REDIRECT_URI],
] as const;
const DEFAULT_MICROSOFT_365_SCOPES = ["User.Read"];

export type Microsoft365ConnectionReadiness = {
  provider: "microsoft-365";
  connectionState: "NotConfigured" | "Ready";
  configured: boolean;
  missingConfiguration: string[];
  syncEnabled: false;
};

export function getMicrosoft365ConnectionReadiness(): Microsoft365ConnectionReadiness {
  const missingConfiguration = MICROSOFT_365_CONFIGURATION
    .filter(([, value]) => !value()?.trim())
    .map(([name]) => name);
  return { provider: "microsoft-365", connectionState: missingConfiguration.length === 0 ? "Ready" : "NotConfigured", configured: missingConfiguration.length === 0, missingConfiguration, syncEnabled: false };
}

export function getMicrosoft365OAuthConfiguration() {
  return {
    clientId: process.env.MICROSOFT_ENTRA_CLIENT_ID?.trim() ?? "",
    tenantId: process.env.MICROSOFT_ENTRA_TENANT_ID?.trim() ?? "",
    redirectUri: process.env.MICROSOFT_ENTRA_REDIRECT_URI?.trim() ?? "",
    scopes: (process.env.MICROSOFT_ENTRA_SCOPES?.trim().split(/\s+/).filter(Boolean) ?? DEFAULT_MICROSOFT_365_SCOPES),
  };
}

export function buildMicrosoft365AuthorizationUrl(configuration: { tenantId: string; clientId: string; redirectUri: string; scopes: string[]; state: string }): string {
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(configuration.tenantId)}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", configuration.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", configuration.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", configuration.scopes.join(" "));
  url.searchParams.set("state", configuration.state);
  return url.toString();
}

export function createMicrosoft365OAuthState() {
  return {
    value: randomBytes(32).toString("base64url"),
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 },
  };
}

export function previewSharePointImport(organizationId: string, sourceSelection: SharePointSourceSelection): ImportPreview {
  return { provider: "microsoft-365", organizationId, connectionState: "NotConnected", sourceSelection, itemCount: 0, message: "Connect Microsoft 365 before importing from SharePoint.", encryptedSecretRef: null };
}
