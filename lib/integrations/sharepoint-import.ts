import type { PrismaClient } from "@/app/generated/prisma/client";
import { GRAPH_BASE } from "@/lib/integrations/graph";

/**
 * Imports one SharePoint file into the evidence model as TEXT.
 *
 * The original document is never copied into Flowstate: the file is fetched,
 * its text extracted, and the bytes discarded. What is persisted is the text,
 * the provenance (source pointer, Graph version, content hash) and the
 * attachment metadata — a citation record, not a document vault.
 *
 * Idempotent by construction: the identity key is derived from the drive item
 * and its content hash (or version when Graph exposes no hash), so re-running
 * over an unchanged file is a no-op rather than a duplicate. A changed file
 * produces a new key, which is what makes staleness detectable.
 */

export const SUPPORTED_EXTENSIONS = ["pdf", "docx"] as const;

export type ImportOutcome =
  | { status: "imported"; capturedInputId: string; sourceHash: string | null }
  | { status: "duplicate"; capturedInputId: string }
  | { status: "skipped"; reason: string };

export type ImportParams = {
  organizationId: string;
  driveId: string;
  itemId: string;
  accessToken: string;
  client: PrismaClient;
  /** Injectable for tests; defaults to the project's document extractor. */
  extractText?: (fileUrl: string) => Promise<string>;
  fetchImpl?: typeof fetch;
};

type GraphItem = {
  id: string;
  name?: string;
  size?: number;
  webUrl?: string;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string; hashes?: { quickXorHash?: string; sha256Hash?: string } };
  folder?: unknown;
};

function extensionOf(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? (parts.pop() as string).toLowerCase() : "";
}

export function idempotencyKeyFor(driveId: string, itemId: string, hash: string | null, version: string | null): string {
  return `sharepoint:${driveId}:${itemId}:${hash ?? version ?? "unknown"}`;
}

export async function importDriveItem({
  organizationId,
  driveId,
  itemId,
  accessToken,
  client,
  extractText,
  fetchImpl = fetch,
}: ImportParams): Promise<ImportOutcome> {
  if (!accessToken?.trim()) throw new Error("Microsoft Graph requires an access token");
  if (!organizationId || !driveId || !itemId) throw new Error("organizationId, driveId and itemId are required");

  const authHeaders = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

  const metaResponse = await fetchImpl(
    `${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,name,size,webUrl,lastModifiedDateTime,file,folder`,
    { headers: authHeaders },
  );
  const meta = (await metaResponse.json().catch(() => ({}))) as GraphItem & { error?: { code?: string } };
  if (!metaResponse.ok) {
    throw new Error(`Microsoft Graph request failed (${meta.error?.code ?? `HTTP ${metaResponse.status}`})`);
  }

  if (meta.folder) return { status: "skipped", reason: "folder" };

  const name = meta.name ?? "";
  const extension = extensionOf(name);
  if (!SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number])) {
    return { status: "skipped", reason: `unsupported_type:${extension || "none"}` };
  }

  const sourceHash = meta.file?.hashes?.quickXorHash ?? meta.file?.hashes?.sha256Hash ?? null;
  const version = meta.lastModifiedDateTime ?? null;
  const idempotencyKey = idempotencyKeyFor(driveId, itemId, sourceHash, version);

  const existing = await client.capturedInput.findUnique({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
    select: { id: true },
  });
  if (existing) return { status: "duplicate", capturedInputId: existing.id };

  // Graph answers /content with a 302 to a pre-authenticated URL. Follow it
  // manually so the bearer token is never sent to the download host.
  const contentResponse = await fetchImpl(
    `${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`,
    { headers: { Authorization: `Bearer ${accessToken}` }, redirect: "manual" },
  );
  let downloadUrl: string | null = contentResponse.headers.get("location");
  if (!downloadUrl && contentResponse.ok) {
    // Some tenants stream the bytes directly instead of redirecting.
    downloadUrl = `${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`;
  }
  if (!downloadUrl) {
    throw new Error(`Microsoft Graph content request failed (HTTP ${contentResponse.status})`);
  }

  const downloadResponse = await fetchImpl(downloadUrl, { headers: {} });
  if (!downloadResponse.ok) {
    throw new Error(`SharePoint download failed (HTTP ${downloadResponse.status})`);
  }

  const extractor = extractText ?? (await import("@/lib/documents/extraction")).extractDocumentText;
  // Text only — the response body is never persisted.
  const text = await extractor(downloadUrl);

  const created = await client.capturedInput.create({
    data: {
      organizationId,
      type: "DOCUMENT",
      sourceRef: meta.webUrl ?? null,
      rawText: text,
      status: "TRANSCRIBED",
      reviewStatus: "PENDING_REVIEW",
      idempotencyKey,
      attachments: {
        create: {
          filename: name,
          contentType: meta.file?.mimeType ?? "application/octet-stream",
          sizeBytes: typeof meta.size === "number" ? meta.size : null,
          sourceRef: meta.webUrl ?? null,
        },
      },
    },
    select: { id: true },
  });

  return { status: "imported", capturedInputId: created.id, sourceHash };
}
