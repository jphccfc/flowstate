import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/data-room/page.tsx"), "utf8");

describe("Data Room request loading state", () => {
  it("does not describe an in-flight request load as an empty data room", () => {
    expect(page).toContain("Loading data room requests");
    expect(page).toContain("setLoadingPacks(false)");
    expect(page).not.toContain("Promise.all([\n      fetch(`/api/clients/${clientId}/data-room`)");
  });
});
