import { prisma } from "@/lib/db";

/** Return true only when the Supabase email has an explicit organization membership. */
export async function isOrganizationMember(
  email: string | null | undefined,
  organizationId: string
): Promise<boolean> {
  if (!email) return false;

  const membership = await prisma.userOrganization.findFirst({
    where: {
      organizationId,
      user: { email },
    },
    select: { id: true },
  });

  return membership !== null;
}
