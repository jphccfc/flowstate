export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { WorkspaceNav } from "@/components/layout/WorkspaceNav";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessClient } from "@/lib/auth/organization";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await prisma.organization.findUnique({ where: { id }, select: { name: true } });
  if (!org) notFound();
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect("/auth/login");
  if (!(await canAccessClient(user.email, id))) redirect("/dashboard");

  return (
    <div className="min-h-screen flex flex-col">
      <div className="workspace-frame">
        <WorkspaceNav clientName={org.name} clientId={id} />
        <div className="workspace-content">{children}</div>
      </div>
    </div>
  );
}
