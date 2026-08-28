"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

interface NavbarProps {
  clientName?: string;
  clientId?: string;
}

export function Navbar({ clientName, clientId }: NavbarProps) {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/users").then((response) => { if (active) setIsAdmin(response.ok); }).catch(() => { if (active) setIsAdmin(false); });
    return () => { active = false; };
  }, []);
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <nav className="h-16 bg-[var(--primary)] text-white flex items-center px-4 sm:px-6 gap-4 shrink-0 border-b border-[var(--workspace-border)]">
      <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
        <div className="workspace-brand-mark">FS</div>
        <span className="workspace-brand-name text-sm hidden sm:block">Flowstate</span>
      </Link>

      {clientName && clientId && (
        <>
          <span className="text-white/40 text-sm">/</span>
          <Link
            href={`/clients/${clientId}`}
            className="text-sm text-white/90 hover:text-white truncate max-w-xs"
          >
            {clientName}
          </Link>
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden md:block text-xs text-[var(--workspace-muted)]">Capability, readiness & growth</span>
        {isAdmin && (
          <Link href="/admin" className="px-3 py-1.5 rounded text-sm text-[var(--accent)] hover:text-white hover:bg-white/10 transition-colors">Platform admin</Link>
        )}

        {clientId && (
          <nav className="flex items-center gap-1">
            {[
              { href: `/clients/${clientId}/configure`, label: "Configure" },
              { href: `/clients/${clientId}/assess`, label: "Assess" },
              { href: `/clients/${clientId}/analysis`, label: "Analysis" },
              { href: `/clients/${clientId}/report`, label: "Report" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 rounded text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <ThemeToggle />

        <button
          onClick={handleSignOut}
          className="ml-2 px-3 py-1.5 rounded text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
