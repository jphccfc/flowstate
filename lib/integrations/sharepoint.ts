export type SharePointSourceSelection = { site: string; library: string; folder: string };
export type IntegrationConnectionState = "NotConnected" | "NotConfigured" | "Ready" | "ConnectionFailed";
export type ImportPreview = { provider: "microsoft-365"; organizationId: string; connectionState: "NotConnected"; sourceSelection: SharePointSourceSelection; itemCount: number; message: string; encryptedSecretRef: string | null };

const MICROSOFT_365_CONFIGURATION = [
  ["MICROSOFT_ENTRA_CLIENT_ID", () => process.env.MICROSOFT_ENTRA_CLIENT_ID],
  ["MICROSOFT_ENTRA_TENANT_ID", () => process.env.MICROSOFT_ENTRA_TENANT_ID],
  ["MICROSOFT_ENTRA_REDIRECT_URI", () => process.env.MICROSOFT_ENTRA_REDIRECT_URI],
] as const;

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
  return {
    provider: "microsoft-365",
    connectionState: missingConfiguration.length === 0 ? "Ready" : "NotConfigured",
    configured: missingConfiguration.length === 0,
    missingConfiguration,
    syncEnabled: false,
  };
}

export function previewSharePointImport(organizationId: string, sourceSelection: SharePointSourceSelection): ImportPreview {
  return { provider: "microsoft-365", organizationId, connectionState: "NotConnected", sourceSelection, itemCount: 0, message: "Connect Microsoft 365 before importing from SharePoint.", encryptedSecretRef: null };
}
