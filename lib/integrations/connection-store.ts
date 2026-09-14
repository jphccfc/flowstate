import type { PrismaClient } from "@/app/generated/prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/integrations/secret-vault";
import type { MicrosoftTokenSet } from "@/lib/integrations/microsoft-oauth";
import { refreshAccessToken } from "@/lib/integrations/microsoft-oauth";

/**
 * Persistence boundary for integration credentials.
 *
 * Tokens are encrypted before they reach the database, so a database dump or a
 * logging accident cannot expose a customer's Microsoft 365 tokens. Nothing in
 * this module ever returns a decrypted token to a client — `getConnectionStatus`
 * is the shape the UI is allowed to see.
 */

export const SHAREPOINT_PROVIDER = "microsoft-365";

export type StoredTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scope: string | null;
};

export type ConnectionStatus = {
  provider: string;
  connectionState: "Connected" | "NotConnected";
  accountEmail: string | null;
  externalTenantId: string | null;
  scope: string | null;
  expiresAt: string | null;
  lastSyncedAt: string | null;
};

/** Reads the integration secret key. Fails closed rather than storing plaintext. */
export function integrationSecretKey(): string {
  const key = process.env.INTEGRATION_SECRET_KEY;
  if (!key || !key.trim()) {
    throw new Error("INTEGRATION_SECRET_KEY is not configured");
  }
  return key;
}

export function serialiseTokens(tokens: MicrosoftTokenSet, keyBase64: string): string {
  const payload: StoredTokens = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt.toISOString(),
    scope: tokens.scope,
  };
  return encryptSecret(JSON.stringify(payload), keyBase64);
}

export function parseTokens(encrypted: string, keyBase64: string): StoredTokens {
  const parsed = JSON.parse(decryptSecret(encrypted, keyBase64)) as StoredTokens;
  if (!parsed?.accessToken) throw new Error("stored integration tokens are incomplete");
  return parsed;
}

export async function saveConnection(
  client: PrismaClient,
  input: {
    organizationId: string;
    provider?: string;
    tokens: MicrosoftTokenSet;
    accountEmail?: string | null;
    externalTenantId?: string | null;
  },
): Promise<ConnectionStatus> {
  const provider = input.provider ?? SHAREPOINT_PROVIDER;
  const encryptedTokens = serialiseTokens(input.tokens, integrationSecretKey());

  const record = await client.integrationConnection.upsert({
    where: { organizationId_provider: { organizationId: input.organizationId, provider } },
    create: {
      organizationId: input.organizationId,
      provider,
      encryptedTokens,
      accountEmail: input.accountEmail ?? null,
      externalTenantId: input.externalTenantId ?? null,
      scope: input.tokens.scope,
      status: "CONNECTED",
    },
    update: {
      encryptedTokens,
      accountEmail: input.accountEmail ?? null,
      externalTenantId: input.externalTenantId ?? null,
      scope: input.tokens.scope,
      status: "CONNECTED",
    },
  });

  return toStatus(record, input.tokens.expiresAt.toISOString());
}

/** Safe projection for API responses and the UI. Never includes tokens. */
export async function getConnectionStatus(
  client: PrismaClient,
  organizationId: string,
  provider: string = SHAREPOINT_PROVIDER,
): Promise<ConnectionStatus> {
  const record = await client.integrationConnection.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  });
  if (!record || record.status !== "CONNECTED") {
    return {
      provider,
      connectionState: "NotConnected",
      accountEmail: null,
      externalTenantId: null,
      scope: null,
      expiresAt: null,
      lastSyncedAt: null,
    };
  }
  let expiresAt: string | null = null;
  try {
    expiresAt = parseTokens(record.encryptedTokens, integrationSecretKey()).expiresAt;
  } catch {
    // A record we cannot decrypt must not look connected.
    return {
      provider,
      connectionState: "NotConnected",
      accountEmail: null,
      externalTenantId: null,
      scope: null,
      expiresAt: null,
      lastSyncedAt: null,
    };
  }
  return toStatus(record, expiresAt);
}

/** Server-side only. Returns a valid decrypted token set for Graph calls. */
export async function getAccessToken(
  client: PrismaClient,
  organizationId: string,
  provider: string = SHAREPOINT_PROVIDER,
): Promise<StoredTokens | null> {
  const record = await client.integrationConnection.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  });
  if (!record || record.status !== "CONNECTED") return null;
  const stored = parseTokens(record.encryptedTokens, integrationSecretKey());
  const expiresAt = Date.parse(stored.expiresAt);
  // Refresh one minute early to avoid a token expiring between the Graph request
  // and Microsoft validating it. Refresh tokens remain encrypted at rest and
  // Microsoft may rotate them, so persist the complete returned token set.
  if (!stored.refreshToken || !Number.isFinite(expiresAt) || expiresAt > Date.now() + 60_000) return stored;

  const refreshed = await refreshAccessToken({
    refreshToken: stored.refreshToken,
    clientId: process.env.MICROSOFT_ENTRA_CLIENT_ID ?? "",
    tenantId: process.env.MICROSOFT_ENTRA_TENANT_ID ?? "",
    clientSecret: process.env.MICROSOFT_ENTRA_CLIENT_SECRET ?? "",
  });
  await client.integrationConnection.update({
    where: { id: record.id },
    data: { encryptedTokens: serialiseTokens(refreshed, integrationSecretKey()), scope: refreshed.scope },
  });
  return {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt.toISOString(),
    scope: refreshed.scope,
  };
}

export async function disconnect(
  client: PrismaClient,
  organizationId: string,
  provider: string = SHAREPOINT_PROVIDER,
): Promise<void> {
  await client.integrationConnection.deleteMany({ where: { organizationId, provider } });
}

function toStatus(
  record: {
    provider: string;
    accountEmail: string | null;
    externalTenantId: string | null;
    scope: string | null;
    lastSyncedAt: Date | null;
  },
  expiresAt: string | null,
): ConnectionStatus {
  return {
    provider: record.provider,
    connectionState: "Connected",
    accountEmail: record.accountEmail,
    externalTenantId: record.externalTenantId,
    scope: record.scope,
    expiresAt,
    lastSyncedAt: record.lastSyncedAt ? record.lastSyncedAt.toISOString() : null,
  };
}
