import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, prisma } from "../helpers/db";

let currentEmail: string | null = "task-member@example.test";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentEmail ? { email: currentEmail } : null } }) },
  }),
}));

import { PATCH as mutateTask } from "@/app/api/external/tasks/[taskId]/route";

const request = (taskId: string, body: unknown) => new Request(
  `http://localhost/api/external/tasks/${taskId}`,
  { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
) as never;

const params = (taskId: string) => ({ params: Promise.resolve({ taskId }) });

describe("external task mutations", () => {
  let organizationId = "";
  let externalEmail = "";
  let staffEmail = "";

  beforeEach(() => {
    currentEmail = "task-member@example.test";
  });

  afterEach(async () => {
    if (organizationId) await cleanupOrganization(organizationId);
    if (externalEmail || staffEmail) {
      await prisma.user.deleteMany({ where: { email: { in: [externalEmail, staffEmail].filter(Boolean) } } });
    }
    organizationId = "";
    externalEmail = "";
    staffEmail = "";
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function fixture() {
    const organization = await prisma.organization.create({ data: { name: "External Task Mutation Test" } });
    organizationId = organization.id;
    externalEmail = "task-member@example.test";
    staffEmail = "task-staff@example.test";
    const [externalUser, staffUser] = await Promise.all([
      prisma.user.upsert({ where: { email: externalEmail }, update: {}, create: { email: externalEmail, role: "CLIENT_STAKEHOLDER" } }),
      prisma.user.upsert({ where: { email: staffEmail }, update: {}, create: { email: staffEmail, role: "ADVISOR" } }),
    ]);
    const [member, otherMember] = await Promise.all([
      prisma.stakeholder.create({ data: { organizationId, name: "Task Member", email: externalEmail } }),
      prisma.stakeholder.create({ data: { organizationId, name: "Other Task Member", email: "other-task-member@example.test" } }),
    ]);
    await prisma.stakeholderPortalMembership.create({ data: { stakeholderId: member.id, userId: externalUser.id, role: "CLIENT" } });
    const [assignedTask, otherTask] = await Promise.all([
      prisma.assessmentTask.create({ data: { organizationId, requesterId: staffUser.id, assigneeId: staffUser.id, type: "EVIDENCE_REQUEST", title: "Assigned task", description: "Task for portal member", dueDate: new Date("2030-01-01T00:00:00.000Z") } }),
      prisma.assessmentTask.create({ data: { organizationId, requesterId: staffUser.id, assigneeId: staffUser.id, type: "EVIDENCE_REQUEST", title: "Other task", description: "Task for other member", dueDate: new Date("2030-01-02T00:00:00.000Z") } }),
    ]);
    await Promise.all([
      prisma.assessmentTaskStakeholder.create({ data: { assessmentTaskId: assignedTask.id, stakeholderId: member.id } }),
      prisma.assessmentTaskStakeholder.create({ data: { assessmentTaskId: otherTask.id, stakeholderId: otherMember.id } }),
    ]);
    return { assignedTask, otherTask, externalUser, member };
  }

  it("forbids a portal member from mutating another stakeholder's task", async () => {
    const { otherTask } = await fixture();

    const response = await mutateTask(request(otherTask.id, { complete: true }), params(otherTask.id));

    expect(response.status).toBe(403);
    expect(await prisma.assessmentTask.findUniqueOrThrow({ where: { id: otherTask.id }, select: { status: true } })).toEqual({ status: "OPEN" });
    expect(await prisma.assessmentTaskActivity.count({ where: { assessmentTaskId: otherTask.id } })).toBe(0);
  });

  it("completes a directly assigned task and writes immutable status and comment activity", async () => {
    const { assignedTask, externalUser, member } = await fixture();

    const response = await mutateTask(request(assignedTask.id, { complete: true, comment: "Evidence uploaded" }), params(assignedTask.id));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ id: assignedTask.id, status: "COMPLETED" }));
    expect(Object.keys(body)).not.toEqual(expect.arrayContaining(["completionNote", "linkedDecisionId", "humanReviewState"]));
    expect(await prisma.assessmentTask.findUniqueOrThrow({ where: { id: assignedTask.id }, select: { status: true, completedById: true, completedAt: true } })).toEqual(expect.objectContaining({ status: "COMPLETED", completedById: externalUser.id, completedAt: expect.any(Date) }));
    expect(await prisma.assessmentTaskActivity.findMany({ where: { assessmentTaskId: assignedTask.id }, select: { type: true, previousStatus: true, nextStatus: true, comment: true, actorUserId: true, actorStakeholderId: true } })).toEqual(expect.arrayContaining([
      { type: "COMMENT_ADDED", previousStatus: null, nextStatus: null, comment: "Evidence uploaded", actorUserId: externalUser.id, actorStakeholderId: member.id },
      { type: "STATUS_CHANGED", previousStatus: "OPEN", nextStatus: "COMPLETED", comment: null, actorUserId: externalUser.id, actorStakeholderId: member.id },
    ]));
  });
});
