import { prisma } from "@/lib/db";
import { Navbar } from "@/components/layout/Navbar";
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
      <Navbar clientName={org.name} clientId={id} />
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}
