import { beforeEach, describe, expect, it } from "vitest";
import { generateSecretKey } from "../../lib/integrations/secret-vault";
import {
  getAccessToken,
  getConnectionStatus,
  parseTokens,
  saveConnection,
  serialiseTokens,
  SHAREPOINT_PROVIDER,
} from "../../lib/integrations/connection-store";

const KEY = generateSecretKey();
const ORG = "org_123";
const tokens = {
  accessToken: "access-token-value",
  refreshToken: "refresh-token-value",
  expiresAt: new Date(Date.now() + 3_600_000),
  scope: "Sites.Read.All Files.Read.All",
};

type Row = {
  id: string;
  organizationId: string;
  provider: string;
  externalTenantId: string | null;
  accountEmail: string | null;
  encryptedTokens: string;
  scope: string | null;
  status: string;
  lastSyncedAt: Date | null;
};

function fakeClient(initial: Row | null = null) {
  const state: { row: Row | null } = { row: initial };
  const calls: { upsert: unknown[]; findUnique: unknown[] } = { upsert: [], findUnique: [] };
  return {
    state,
    calls,
    integrationConnection: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      upsert: async (args: any) => {
        calls.upsert.push(args);
        state.row = {
          ...(args.create as Row),
          id: "conn_1",
          lastSyncedAt: null,
        } as Row;
        return state.row;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async (args: any) => {
        calls.findUnique.push(args);
        return state.row;
      },
      deleteMany: async () => ({ count: 1 }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  process.env.INTEGRATION_SECRET_KEY = KEY;
});

describe("integration token storage", () => {
  it("encrypts tokens so the stored value never contains the plaintext token", () => {
    const stored = serialiseTokens(tokens, KEY);
    expect(stored).not.toContain("access-token-value");
    expect(stored).not.toContain("refresh-token-value");
    expect(parseTokens(stored, KEY).refreshToken).toBe("refresh-token-value");
  });

  it("fails closed when the encryption key is not configured", async () => {
    delete process.env.INTEGRATION_SECRET_KEY;
    await expect(saveConnection(fakeClient(), { organizationId: ORG, tokens })).rejects.toThrow(/INTEGRATION_SECRET_KEY/);
  });

  it("persists encrypted tokens scoped to the organisation and provider", async () => {
    const client = fakeClient();
    const status = await saveConnection(client, {
      organizationId: ORG,
      tokens,
      accountEmail: "jon@woodburysolutions.ca",
      externalTenantId: "tenant-1",
    });

    const args = client.calls.upsert[0] as { where: unknown; create: Record<string, unknown> };
    expect(JSON.stringify(args.where)).toContain(ORG);
    expect(JSON.stringify(args.where)).toContain(SHAREPOINT_PROVIDER);
    expect(String(args.create.encryptedTokens)).not.toContain("access-token-value");
    expect(status.connectionState).toBe("Connected");
    expect(status.accountEmail).toBe("jon@woodburysolutions.ca");
    expect(JSON.stringify(status)).not.toContain("access-token-value");
    expect(JSON.stringify(status)).not.toContain("refresh-token-value");
  });
});

describe("connection status projection", () => {
  it("reports NotConnected when nothing is stored", async () => {
    const status = await getConnectionStatus(fakeClient(null), ORG);
    expect(status.connectionState).toBe("NotConnected");
    expect(status.accountEmail).toBeNull();
  });

  it("reports Connected without leaking tokens", async () => {
    const client = fakeClient();
    await saveConnection(client, { organizationId: ORG, tokens, accountEmail: "a@b.com" });
    const status = await getConnectionStatus(client, ORG);
    expect(status.connectionState).toBe("Connected");
    expect(status.expiresAt).toBe(tokens.expiresAt.toISOString());
    expect(JSON.stringify(status)).not.toContain("access-token-value");
  });

  it("treats an undecryptable record as NotConnected rather than connected", async () => {
    const client = fakeClient({
      id: "conn_1",
      organizationId: ORG,
      provider: SHAREPOINT_PROVIDER,
      externalTenantId: null,
      accountEmail: null,
      encryptedTokens: "v1.bogus.bogus.bogus",
      scope: null,
      status: "CONNECTED",
      lastSyncedAt: null,
    });
    const status = await getConnectionStatus(client, ORG);
    expect(status.connectionState).toBe("NotConnected");
  });

  it("returns decrypted tokens only through the server-side accessor", async () => {
    const client = fakeClient();
    await saveConnection(client, { organizationId: ORG, tokens });
    const stored = await getAccessToken(client, ORG);
    expect(stored?.accessToken).toBe("access-token-value");
    expect(stored?.scope).toBe("Sites.Read.All Files.Read.All");

    const none = await getAccessToken(fakeClient(null), ORG);
    expect(none).toBeNull();
  });

  it("scopes lookups by organisation so one tenant cannot read another's connection", async () => {
    const client = fakeClient();
    await getConnectionStatus(client, ORG);
    const args = client.calls.findUnique[0] as { where: unknown };
    expect(JSON.stringify(args.where)).toContain("organizationId_provider");
    expect(JSON.stringify(args.where)).toContain(ORG);
  });
});
