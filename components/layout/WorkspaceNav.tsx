"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

type NavItem = { href: string; label: string; short: string };

export function WorkspaceNav({ clientId, clientName }: { clientId: string; clientName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items: NavItem[] = [
    { href: `/clients/${clientId}`, label: "Overview", short: "01" },
    { href: `/clients/${clientId}/configure`, label: "Blueprint", short: "02" },
    { href: `/clients/${clientId}/assess`, label: "Assessment", short: "03" },
    { href: `/clients/${clientId}/analysis`, label: "Insights", short: "04" },
    { href: `/clients/${clientId}/report`, label: "Reports", short: "05" },
    { href: `/clients/${clientId}/recommendations`, label: "Growth plan", short: "06" },
    { href: `/clients/${clientId}/review`, label: "Review queue", short: "07" },
  ];

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <aside className={`workspace-rail${open ? " is-open" : ""}`}>
      <div className="workspace-rail-header">
        <Link href="/dashboard" className="workspace-brand" onClick={() => setOpen(false)}>
          <span className="workspace-brand-mark" aria-hidden="true">FS</span>
          <span className="workspace-brand-name">Flowstate</span>
        </Link>
        <button
          type="button"
          className="workspace-menu-button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="workspace-navigation-panel"
          aria-label={open ? "Close workspace navigation" : "Open workspace navigation"}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      <div id="workspace-navigation-panel" className="workspace-navigation-panel">
        <div className="workspace-context">
          <div className="workspace-context-label">Business workspace</div>
          <div className="workspace-context-name" title={clientName}>{clientName}</div>
        </div>

        <nav className="workspace-nav" aria-label="Workspace navigation">
          {items.map((item) => {
            const active = item.href === `/clients/${clientId}` ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="workspace-nav-link"
                onClick={() => setOpen(false)}
              >
                <span className="workspace-nav-icon" aria-hidden="true">{item.short}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="workspace-actions">
          <ThemeToggle />
          <button type="button" className="workspace-signout" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </aside>
  );
}
