import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/tasks/route.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/tasks/page.tsx"), "utf8");

describe("assessment task deletion contract", () => {
  it("provides an authorised delete handler for empty operational tasks", () => {
    expect(route).toContain("export async function DELETE");
    expect(route).toContain("taskId");
    expect(route).toContain("assessmentTask.delete");
    expect(page).toContain("Delete task");
    expect(page).toContain("method: \"DELETE\"");
  });
});
