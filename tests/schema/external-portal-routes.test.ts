import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, prisma } from "../helpers/db";

let currentEmail: string | null = "portal-member@example.test";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentEmail ? { email: currentEmail } : null } }) },
  }),
}));

import { GET as listTasks } from "@/app/api/external/tasks/route";
import { GET as listMeetings } from "@/app/api/external/meetings/route";

const request = (path: string) => new Request(`http://localhost${path}`) as never;

describe("external portal database access", () => {
  let organizationId = "";
  let externalEmail = "";
  let staffEmail = "";

  beforeEach(() => {
    currentEmail = "portal-member@example.test";
  });

  afterEach(async () => {
    if (organizationId) await cleanupOrganization(organizationId);
    if (externalEmail || staffEmail) await prisma.user.deleteMany({ where: { email: { in: [externalEmail, staffEmail].filter(Boolean) } } });
    organizationId = "";
    externalEmail = "";
    staffEmail = "";
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns only the member's directly assigned task and attended meeting with external-safe fields", async () => {
    const organization = await prisma.organization.create({ data: { name: "External Portal Route Test" } });
    organizationId = organization.id;
    externalEmail = "portal-member@example.test";
    staffEmail = "portal-staff@example.test";
    const [externalUser, staffUser] = await Promise.all([
      prisma.user.upsert({ where: { email: externalEmail }, update: {}, create: { email: externalEmail, role: "CLIENT_STAKEHOLDER" } }),
      prisma.user.upsert({ where: { email: staffEmail }, update: {}, create: { email: staffEmail, role: "ADVISOR" } }),
    ]);
    const [member, someoneElse] = await Promise.all([
      prisma.stakeholder.create({ data: { organizationId, name: "Portal Member", email: externalEmail } }),
      prisma.stakeholder.create({ data: { organizationId, name: "Other Stakeholder", email: "other@example.test" } }),
    ]);
    await prisma.stakeholderPortalMembership.create({ data: { stakeholderId: member.id, userId: externalUser.id, role: "CLIENT" } });

    const [assignedTask, otherTask, attendedMeeting, otherMeeting] = await Promise.all([
      prisma.assessmentTask.create({ data: { organizationId, requesterId: staffUser.id, assigneeId: staffUser.id, type: "EVIDENCE_REQUEST", title: "Submit audited accounts", description: "Upload the FY25 accounts", dueDate: new Date("2030-01-01T00:00:00.000Z"), completionNote: "Internal follow-up" } }),
      prisma.assessmentTask.create({ data: { organizationId, requesterId: staffUser.id, assigneeId: staffUser.id, type: "EVIDENCE_REQUEST", title: "Other task", description: "Not for this member", dueDate: new Date("2030-01-02T00:00:00.000Z") } }),
      prisma.meetingContext.create({ data: { organizationId, title: "Member meeting", objectives: "Discuss submitted evidence", stakeholderName: "Internal-only name" } }),
      prisma.meetingContext.create({ data: { organizationId, title: "Other meeting" } }),
    ]);
    await Promise.all([
      prisma.assessmentTaskStakeholder.create({ data: { assessmentTaskId: assignedTask.id, stakeholderId: member.id } }),
      prisma.assessmentTaskStakeholder.create({ data: { assessmentTaskId: otherTask.id, stakeholderId: someoneElse.id } }),
      prisma.meetingContextStakeholder.create({ data: { meetingContextId: attendedMeeting.id, stakeholderId: member.id } }),
      prisma.meetingContextStakeholder.create({ data: { meetingContextId: otherMeeting.id, stakeholderId: someoneElse.id } }),
    ]);

    const [tasksResponse, meetingsResponse] = await Promise.all([
      listTasks(request(`/api/external/tasks?organizationId=${organizationId}`)),
      listMeetings(request(`/api/external/meetings?organizationId=${organizationId}`)),
    ]);

    expect(tasksResponse.status).toBe(200);
    const tasks = await tasksResponse.json();
    expect(tasks).toEqual([expect.objectContaining({ id: assignedTask.id, title: "Submit audited accounts" })]);
    expect(tasks).not.toContainEqual(expect.objectContaining({ id: otherTask.id }));
    expect(meetingsResponse.status).toBe(200);
    const meetings = await meetingsResponse.json();
    expect(meetings).toEqual([expect.objectContaining({ id: attendedMeeting.id, title: "Member meeting" })]);
    expect(meetings).not.toContainEqual(expect.objectContaining({ id: otherMeeting.id }));
    expect(Object.keys(tasks[0])).not.toEqual(expect.arrayContaining(["completionNote", "linkedDecisionId", "humanReviewState"]));
    expect(Object.keys(meetings[0])).not.toEqual(expect.arrayContaining(["stakeholderName", "stakeholders", "domain", "domainName"]));
  });
});
