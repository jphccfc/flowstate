import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/data-room/route.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/data-room/page.tsx"), "utf8");

describe("Data Room individual request management", () => {
  it("allows an authorised user to add a request to an existing category", () => {
    expect(route).toContain("categoryId");
    expect(route).toContain("dataRoomRequestItem.create");
  });

  it("allows request title/detail updates and an auditable no-longer-needed status", () => {
    expect(route).toContain("body.title");
    expect(route).toContain("body.detail");
    expect(route).toContain("No longer needed requests require a rationale");
  });

  it("only hard-deletes an untouched, unlinked requested item", () => {
    expect(route).toContain("export async function DELETE");
    expect(route).toContain('status !== "REQUESTED"');
    expect(route).toContain("linkedInputId");
    expect(route).toContain("dataRoomRequestItem.delete");
  });

  it("renders add, edit, no-longer-needed and safe delete actions", () => {
    expect(page).toContain("Add request");
    expect(page).toContain("Edit request");
    expect(page).toContain("No longer needed");
    expect(page).toContain("Delete request");
    expect(page).toContain('method: "DELETE"');
  });
});
