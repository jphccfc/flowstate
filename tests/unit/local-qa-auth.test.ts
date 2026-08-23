import { describe, expect, it } from "vitest";
import { getLocalQaUser, isLocalQaAuthEnabled } from "../../lib/supabase/local-qa";

describe("local QA authentication", () => {
  it("is disabled unless explicitly enabled outside production", () => {
    expect(isLocalQaAuthEnabled({ NODE_ENV: "development", FLOWSTATE_LOCAL_QA_AUTH: "1" })).toBe(true);
    expect(isLocalQaAuthEnabled({ NODE_ENV: "production", FLOWSTATE_LOCAL_QA_AUTH: "1" })).toBe(false);
    expect(isLocalQaAuthEnabled({ NODE_ENV: "development", FLOWSTATE_LOCAL_QA_AUTH: "0" })).toBe(false);
  });

  it("provides a deterministic local-only test identity", () => {
    expect(getLocalQaUser()).toEqual({ id: "local-qa-user", email: "qa@flowstate.local" });
  });
});
