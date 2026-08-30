export type SharePointSourceSelection = { site: string; library: string; folder: string };
export type IntegrationConnectionState = "NotConnected" | "Connected";
export type ImportPreview = { provider: "microsoft-365"; organizationId: string; connectionState: IntegrationConnectionState; sourceSelection: SharePointSourceSelection; itemCount: number; message: string; encryptedSecretRef: string | null };
export function previewSharePointImport(organizationId: string, sourceSelection: SharePointSourceSelection): ImportPreview { return { provider: "microsoft-365", organizationId, connectionState: "NotConnected", sourceSelection, itemCount: 0, message: "Connect Microsoft 365 before importing from SharePoint.", encryptedSecretRef: null }; }
