import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

const auth = vi.hoisted(() => ({
  user: { id: "test-user", email: "recommendation-advisor@test.com" } as { id: string; email: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: auth.user } }) },
  }),
}));

import {
  GET as listRecommendations,
  POST as createRecommendation,
} from "../../app/api/recommendations/route";
import { PATCH as patchRecommendation } from "../../app/api/recommendations/[id]/route";

describe("recommendation routes", () => {
  const organizationIds: string[] = [];

  beforeEach(() => {
    auth.user = { id: "test-user", email: "recommendation-advisor@test.com" };
  });

  afterAll(async () => {
    for (const organizationId of organizationIds) {
      await cleanupOrganization(organizationId);
    }
    await prisma.$disconnect();
  });

  async function createOrganization(name: string) {
    const organization = await createTestOrganization({ name });
    organizationIds.push(organization.id);
    return organization;
  }

  function request(url: string, options?: RequestInit) {
    return new Request(`http://localhost${url}`, options);
  }

  it("POST creates a DRAFT recommendation scoped to an organization", async () => {
    const organization = await createOrganization("Recommendation Create Org");

    const response = await createRecommendation(
      request("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: organization.id,
          title: "Digitize process tracking",
          description: "Replace manual logs with a shared tracking workflow.",
          estimatedValue: 250000,
          status: "APPROVED",
        }),
      }) as never
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.organizationId).toBe(organization.id);
    expect(body.status).toBe("DRAFT");
    expect(body.title).toBe("Digitize process tracking");
  });

  it("GET lists only the requested organization's recommendations and filters by status", async () => {
    const organization = await createOrganization("Recommendation List Org");
    const otherOrganization = await createOrganization("Other Recommendation Org");

    await prisma.recommendation.createMany({
      data: [
        {
          organizationId: organization.id,
          title: "Draft recommendation",
          description: "Draft description",
          status: "DRAFT",
        },
        {
          organizationId: organization.id,
          title: "Approved recommendation",
          description: "Approved description",
          status: "APPROVED",
        },
        {
          organizationId: otherOrganization.id,
          title: "Other organization recommendation",
          description: "Other description",
          status: "APPROVED",
        },
      ],
    });

    const response = await listRecommendations(
      request(`/api/recommendations?organizationId=${organization.id}&status=APPROVED`) as never
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Approved recommendation");
    expect(body[0].organizationId).toBe(organization.id);
  });

  it("GET includes review feedback history for each recommendation", async () => {
    const organization = await createOrganization("Recommendation Feedback Org");
    const recommendation = await prisma.recommendation.create({
      data: {
        organizationId: organization.id,
        title: "Feedback recommendation",
        description: "Recommendation with review history",
        status: "REJECTED",
      },
    });
    await prisma.recommendationFeedback.create({
      data: {
        recommendationId: recommendation.id,
        action: "rejected",
        reason: "Needs a stronger business case",
        actedBy: "reviewer@test.com",
      },
    });

    const response = await listRecommendations(
      request(`/api/recommendations?organizationId=${organization.id}`) as never
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body[0].feedback).toHaveLength(1);
    expect(body[0].feedback[0]).toMatchObject({
      action: "rejected",
      reason: "Needs a stronger business case",
      actedBy: "reviewer@test.com",
    });
  });

  it("PATCH edits fields, marks the recommendation EDITED, and records feedback", async () => {
    const organization = await createOrganization("Recommendation Edit Org");
    const recommendation = await prisma.recommendation.create({
      data: {
        organizationId: organization.id,
        title: "Original title",
        description: "Original description",
        estimatedValue: 250000,
        status: "DRAFT",
      },
    });

    const response = await patchRecommendation(
      request(`/api/recommendations/${recommendation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Updated title",
          estimatedValue: 200000,
          reason: "Estimate revised after advisor review",
        }),
      }) as never,
      { params: Promise.resolve({ id: recommendation.id }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.title).toBe("Updated title");
    expect(body.estimatedValue).toBe(200000);
    expect(body.status).toBe("EDITED");

    const feedback = await prisma.recommendationFeedback.findMany({
      where: { recommendationId: recommendation.id },
    });
    expect(feedback).toHaveLength(1);
    expect(feedback[0].action).toBe("edited");
    expect(feedback[0].originalFields).toMatchObject({ title: "Original title", estimatedValue: 250000 });
    expect(feedback[0].editedFields).toMatchObject({ title: "Updated title", estimatedValue: 200000 });
    expect(feedback[0].reason).toBe("Estimate revised after advisor review");
    expect(feedback[0].actedBy).toBe("recommendation-advisor@test.com");
  });

  it("submits a draft for review and records feedback", async () => {
    const organization = await createOrganization("Recommendation Submit Org");
    const recommendation = await prisma.recommendation.create({
      data: {
        organizationId: organization.id,
        title: "Submit recommendation",
        description: "Ready for advisor review",
        status: "DRAFT",
      },
    });

    const response = await patchRecommendation(
      request(`/api/recommendations/${recommendation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", reason: "Ready for review" }),
      }) as never,
      { params: Promise.resolve({ id: recommendation.id }) }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("PENDING_REVIEW");

    const feedback = await prisma.recommendationFeedback.findFirstOrThrow({
      where: { recommendationId: recommendation.id },
    });
    expect(feedback).toMatchObject({
      action: "submitted",
      reason: "Ready for review",
      actedBy: "recommendation-advisor@test.com",
    });
  });

  it("rejects approval before a recommendation is submitted for review", async () => {
    const organization = await createOrganization("Recommendation Workflow Org");
    const recommendation = await prisma.recommendation.create({
      data: {
        organizationId: organization.id,
        title: "Workflow recommendation",
        description: "Must be submitted first",
        status: "DRAFT",
      },
    });

    const response = await patchRecommendation(
      request(`/api/recommendations/${recommendation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      }) as never,
      { params: Promise.resolve({ id: recommendation.id }) }
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("PENDING_REVIEW");
  });

  it.each([
    ["approve", "APPROVED", "approved"],
    ["reject", "REJECTED", "rejected"],
  ] as const)("PATCH action %s changes status and records feedback", async (action, status, feedbackAction) => {
    const organization = await createOrganization(`Recommendation ${action} Org`);
    const recommendation = await prisma.recommendation.create({
      data: {
        organizationId: organization.id,
        title: `${action} recommendation`,
        description: "Recommendation description",
        status: "PENDING_REVIEW",
      },
    });

    const response = await patchRecommendation(
      request(`/api/recommendations/${recommendation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: `${action} reason` }),
      }) as never,
      { params: Promise.resolve({ id: recommendation.id }) }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe(status);

    const feedback = await prisma.recommendationFeedback.findFirstOrThrow({
      where: { recommendationId: recommendation.id },
    });
    expect(feedback.action).toBe(feedbackAction);
    expect(feedback.reason).toBe(`${action} reason`);
    expect(feedback.actedBy).toBe("recommendation-advisor@test.com");
  });

  it("returns 400 for missing required fields and invalid actions", async () => {
    const missingFieldResponse = await createRecommendation(
      request("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Missing description" }),
      }) as never
    );
    expect(missingFieldResponse.status).toBe(400);

    const organization = await createOrganization("Recommendation Invalid Action Org");
    const recommendation = await prisma.recommendation.create({
      data: {
        organizationId: organization.id,
        title: "Invalid action recommendation",
        description: "Recommendation description",
      },
    });
    const invalidActionResponse = await patchRecommendation(
      request(`/api/recommendations/${recommendation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "archive" }),
      }) as never,
      { params: Promise.resolve({ id: recommendation.id }) }
    );
    expect(invalidActionResponse.status).toBe(400);
  });

  it("returns 404 for an unknown recommendation ID", async () => {
    const response = await patchRecommendation(
      request("/api/recommendations/does-not-exist", {
        method: "PATCH",
        body: JSON.stringify({ action: "approve" }),
      }) as never,
      { params: Promise.resolve({ id: "does-not-exist" }) }
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 for an authenticated user without organization membership", async () => {
    const organization = await createOrganization("Recommendation Unauthorized Org");
    await prisma.userOrganization.deleteMany({
      where: { organizationId: organization.id, user: { email: "recommendation-advisor@test.com" } },
    });
    const recommendation = await prisma.recommendation.create({
      data: {
        organizationId: organization.id,
        title: "Private recommendation",
        description: "Must not be exposed cross-organization.",
      },
    });

    const getResponse = await listRecommendations(
      request(`/api/recommendations?organizationId=${organization.id}`) as never
    );
    const patchResponse = await patchRecommendation(
      request(`/api/recommendations/${recommendation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "approve" }),
      }) as never,
      { params: Promise.resolve({ id: recommendation.id }) }
    );
    const postResponse = await createRecommendation(
      request("/api/recommendations", {
        method: "POST",
        body: JSON.stringify({
          organizationId: organization.id,
          title: "Cross-org write",
          description: "Must not be created.",
        }),
      }) as never
    );

    expect(getResponse.status).toBe(403);
    expect(patchResponse.status).toBe(403);
    expect(postResponse.status).toBe(403);
  });

  it("returns 401 before accessing recommendation data when unauthenticated", async () => {
    auth.user = null;

    const postResponse = await createRecommendation(
      request("/api/recommendations", { method: "POST", body: "{}" }) as never
    );
    const getResponse = await listRecommendations(
      request("/api/recommendations?organizationId=does-not-matter") as never
    );
    const patchResponse = await patchRecommendation(
      request("/api/recommendations/does-not-exist", {
        method: "PATCH",
        body: JSON.stringify({ action: "approve" }),
      }) as never,
      { params: Promise.resolve({ id: "does-not-exist" }) }
    );

    expect(postResponse.status).toBe(401);
    expect(getResponse.status).toBe(401);
    expect(patchResponse.status).toBe(401);
  });
});
