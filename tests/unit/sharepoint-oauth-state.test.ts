import { describe, expect, it } from "vitest";
import { generateSecretKey } from "../../lib/integrations/secret-vault";
import { signOAuthState, verifyOAuthState } from "../../lib/integrations/oauth-state";

const KEY = generateSecretKey();
const base = {
  organizationId: "org_123",
  userId: "user_456",
  state: "state-abc",
  expiresAt: Date.now() + 10 * 60 * 1000,
};

describe("OAuth state cookie", () => {
  it("round-trips the organization, user and CSRF state", () => {
    const token = signOAuthState(base, KEY);
    const parsed = verifyOAuthState(token, KEY);
    expect(parsed.organizationId).toBe("org_123");
    expect(parsed.userId).toBe("user_456");
    expect(parsed.state).toBe("state-abc");
  });

  it("does not expose the payload in plain text", () => {
    const token = signOAuthState(base, KEY);
    expect(token).not.toContain("org_123");
    expect(token).not.toContain("state-abc");
  });

  it("rejects a tampered payload, a wrong key and a truncated token", () => {
    const token = signOAuthState(base, KEY);
    expect(() => verifyOAuthState(token, generateSecretKey())).toThrow();
    expect(() => verifyOAuthState(`${token}x`, KEY)).toThrow();
    expect(() => verifyOAuthState("garbage", KEY)).toThrow();
    expect(() => verifyOAuthState("", KEY)).toThrow();

    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...base, organizationId: "org_attacker" })).toString("base64url");
    expect(() => verifyOAuthState(`${forged}.${sig}`, KEY)).toThrow();
    expect(payload).toBeTruthy();
  });

  it("rejects an expired round trip", () => {
    const expired = signOAuthState({ ...base, expiresAt: Date.now() - 1000 }, KEY);
    expect(() => verifyOAuthState(expired, KEY)).toThrow(/expired/i);
  });
});
