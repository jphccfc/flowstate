import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  currentUser: null as { email: string } | null,
  db: {
    user: { findUnique: vi.fn() },
    assessmentTask: { findMany: vi.fn() },
    meetingContext: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: state.db }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.currentUser } }) },
  }),
}));

import { GET as listTasks } from "@/app/api/external/tasks/route";
import { GET as listMeetings } from "@/app/api/external/meetings/route";

const request = (path: string) => new Request(`http://localhost${path}`) as never;

describe("external portal GET routes", () => {
  beforeEach(() => {
    state.currentUser = null;
    state.db.user.findUnique.mockReset();
    state.db.assessmentTask.findMany.mockReset();
    state.db.meetingContext.findMany.mockReset();
  });

  it("returns 401 before querying tasks when unauthenticated", async () => {
    const response = await listTasks(request("/api/external/tasks?organizationId=org-1"));

    expect(response.status).toBe(401);
    expect(state.db.user.findUnique).not.toHaveBeenCalled();
    expect(state.db.assessmentTask.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 without a portal membership before querying meetings", async () => {
    state.currentUser = { email: "external@example.test" };
    state.db.user.findUnique.mockResolvedValue({ id: "user-1", stakeholderPortalMemberships: [] });

    const response = await listMeetings(request("/api/external/meetings?organizationId=org-1"));

    expect(response.status).toBe(403);
    expect(state.db.meetingContext.findMany).not.toHaveBeenCalled();
  });
});
