export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { WorkspaceNav } from "@/components/layout/WorkspaceNav";
import { notFound } from "next/navigation";

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

  return (
    <div className="min-h-screen flex flex-col">
      <div className="workspace-frame">
        <WorkspaceNav clientName={org.name} clientId={id} />
        <div className="workspace-content">{children}</div>
      </div>
    </div>
  );
}
