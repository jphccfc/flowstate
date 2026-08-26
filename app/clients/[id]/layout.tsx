export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { canAccessClient } from "@/lib/auth/organization";
import { prisma } from "@/lib/db";
import { Navbar } from "@/components/layout/Navbar";
import { notFound, redirect } from "next/navigation";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  if (!(await canAccessClient(user.email, id))) notFound();

  const org = await prisma.organization.findUnique({ where: { id }, select: { name: true } });
  if (!org) notFound();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar clientName={org.name} clientId={id} />
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}
