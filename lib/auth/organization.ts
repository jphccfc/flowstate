import { prisma } from "@/lib/db";

export type OrganizationRole = "SYSTEM_ADMIN" | "ADVISOR" | "CLIENT_EXECUTIVE" | "CLIENT_STAKEHOLDER" | "INVESTOR";
export type OrganizationPermission =
  | "client.read"
  | "client.configure"
  | "members.read"
  | "members.manage"
  | "evidence.read"
  | "evidence.create"
  | "assessment.submit"
  | "assessment.review"
  | "assessment.approve"
  | "assessment.signoff"
  | "recommendation.manage"
  | "reports.read";

const ROLE_PERMISSIONS: Record<OrganizationRole, readonly OrganizationPermission[]> = {
  SYSTEM_ADMIN: [
    "client.read", "client.configure", "members.read", "members.manage",
    "evidence.read", "evidence.create", "assessment.submit", "assessment.review",
    "assessment.approve", "assessment.signoff", "recommendation.manage", "reports.read",
  ],
  ADVISOR: [
    "client.read", "client.configure", "members.read", "members.manage",
    "evidence.read", "evidence.create", "assessment.submit", "assessment.review",
    "assessment.approve", "assessment.signoff", "recommendation.manage", "reports.read",
  ],
  CLIENT_EXECUTIVE: [
    "client.read", "members.read", "evidence.read", "evidence.create",
    "assessment.submit", "assessment.review", "assessment.signoff", "reports.read",
  ],
  CLIENT_STAKEHOLDER: [
    "client.read", "evidence.read", "evidence.create", "assessment.submit", "reports.read",
  ],
  INVESTOR: ["client.read", "reports.read"],
};

export function permissionsForRole(role: OrganizationRole): readonly OrganizationPermission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(role: OrganizationRole, permission: OrganizationPermission): boolean {
  return permissionsForRole(role).includes(permission);
}

export async function getOrganizationMembership(email: string | null | undefined, organizationId: string) {
  if (!email) return null;
  return prisma.userOrganization.findFirst({
    where: { organizationId, user: { email } },
    select: { id: true, userId: true, organizationId: true, role: true, user: { select: { email: true, name: true } } },
  });
}

export async function hasOrganizationPermission(
  email: string | null | undefined,
  organizationId: string,
  permission: OrganizationPermission
): Promise<boolean> {
  const membership = await getOrganizationMembership(email, organizationId);
  return membership ? hasPermission(membership.role as OrganizationRole, permission) : false;
}

export async function isOrganizationMember(email: string | null | undefined, organizationId: string): Promise<boolean> {
  return (await getOrganizationMembership(email, organizationId)) !== null;
}

export async function hasOrganizationMembership(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const membership = await prisma.userOrganization.findFirst({ where: { user: { email } }, select: { id: true } });
  return membership !== null;
}


export async function isSystemAdmin(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const user = await prisma.user.findUnique({ where: { email }, select: { role: true } });
  return user?.role === "SYSTEM_ADMIN";
}
