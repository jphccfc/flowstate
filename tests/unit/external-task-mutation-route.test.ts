import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  currentUser: null as { email: string } | null,
  db: {
    assessmentTask: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: state.db }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.currentUser } }) },
  }),
}));

import { PATCH as mutateTask } from "@/app/api/external/tasks/[taskId]/route";

const request = (body: unknown) => new Request("http://localhost/api/external/tasks/task-1", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
}) as never;

describe("external task mutation route", () => {
  beforeEach(() => {
    state.currentUser = { email: "external@example.test" };
    state.db.assessmentTask.findUnique.mockReset();
    state.db.user.findUnique.mockReset();
  });

  it("rejects arbitrary status changes before accessing task data", async () => {
    const response = await mutateTask(request({ status: "IN_PROGRESS" }), { params: Promise.resolve({ taskId: "task-1" }) });

    expect(response.status).toBe(400);
    expect(state.db.assessmentTask.findUnique).not.toHaveBeenCalled();
    expect(state.db.user.findUnique).not.toHaveBeenCalled();
  });
});
