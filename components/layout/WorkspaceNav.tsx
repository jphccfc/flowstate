"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

type NavItem = { href: string; label: string; short: string };
type Workspace = { id: string; name: string; industry: string | null };

export function WorkspaceNav({ clientId, clientName }: { clientId: string; clientName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/clients").then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      if (active) setWorkspaces(data);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const closeMenu = window.setTimeout(() => {
      setOpen(false);
      setWorkspacePickerOpen(false);
    }, 0);
    return () => window.clearTimeout(closeMenu);
  }, [pathname]);

  const items: NavItem[] = [
    { href: `/clients/${clientId}`, label: "Overview", short: "01" },
    { href: `/clients/${clientId}/capture`, label: "Capture evidence", short: "02" },
    { href: `/clients/${clientId}/configure`, label: "Blueprint", short: "02" },
    { href: `/clients/${clientId}/assess`, label: "Assessment", short: "03" },
    { href: `/clients/${clientId}/tasks`, label: "Assessment tasks", short: "04" },
    { href: `/clients/${clientId}/planning`, label: "Planning items", short: "05" },
    { href: `/clients/${clientId}/communication-packs`, label: "Communication packs", short: "06" },
    { href: `/clients/${clientId}/analysis`, label: "Insights", short: "06" },
    { href: `/clients/${clientId}/report`, label: "Reports", short: "07" },
    { href: `/clients/${clientId}/recommendations`, label: "Growth plan", short: "08" },
    { href: `/clients/${clientId}/review`, label: "Review queue", short: "09" },
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
          <button type="button" className="workspace-context-button" onClick={() => setWorkspacePickerOpen((value) => !value)} aria-expanded={workspacePickerOpen} aria-controls="workspace-switcher">
            <span className="workspace-context-label">Business workspace</span>
            <span className="workspace-context-name" title={clientName}>{clientName}</span>
            <span className="workspace-context-chevron" aria-hidden="true">{workspacePickerOpen ? "⌃" : "⌄"}</span>
          </button>
          {workspacePickerOpen && <div id="workspace-switcher" className="workspace-switcher">{workspaces.map((workspace) => <Link key={workspace.id} href={`/clients/${workspace.id}`} className="workspace-switcher-link" aria-current={workspace.id === clientId ? "page" : undefined} onClick={() => { setWorkspacePickerOpen(false); setOpen(false); }}><span className="workspace-switcher-mark" aria-hidden="true">{workspace.name.slice(0, 2).toUpperCase()}</span><span><strong>{workspace.name}</strong><small>{workspace.industry ?? "Business workspace"}</small></span></Link>)}</div>}
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
          <Link href="/profile" className="workspace-signout" onClick={() => setOpen(false)}>Profile</Link>
          <ThemeToggle />
          <button type="button" className="workspace-signout" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </aside>
  );
}
