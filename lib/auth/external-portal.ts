import { prisma } from "@/lib/db";

export const externalTaskSelect = {
  id: true,
  title: true,
  description: true,
  dueDate: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const externalMeetingSelect = {
  id: true,
  title: true,
  startsAt: true,
  dateTime: true,
  objectives: true,
  agendaItems: true,
  desiredOutcome: true,
} as const;

export type ExternalPortalAccess = {
  userId: string;
  stakeholderIds: string[];
  roles: ("CLIENT" | "PARTNER")[];
};

/**
 * External portal access fails closed. Internal organisation membership does not
 * grant portal visibility, and portal membership does not grant internal access.
 */
export async function resolveExternalPortalAccess(email: string | null | undefined, organizationId: string): Promise<ExternalPortalAccess | null> {
  if (!email) return null;
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      stakeholderPortalMemberships: {
        where: { stakeholder: { organizationId } },
        select: { stakeholderId: true, role: true },
      },
    },
  });
  if (!user || user.stakeholderPortalMemberships.length === 0) return null;
  return {
    userId: user.id,
    stakeholderIds: user.stakeholderPortalMemberships.map(membership => membership.stakeholderId),
    roles: user.stakeholderPortalMemberships.map(membership => membership.role),
  };
}

export function assignmentWhere(access: ExternalPortalAccess) {
  return { externalAssignees: { some: { stakeholderId: { in: access.stakeholderIds } } } };
}

export function attendanceWhere(access: ExternalPortalAccess) {
  return { externalAttendees: { some: { stakeholderId: { in: access.stakeholderIds } } } };
}
