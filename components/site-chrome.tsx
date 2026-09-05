"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/app", label: "Scan" },
  { href: "/agents", label: "Agents" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-foreground">
          <span className="flex size-8 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
            <Shield className="size-4" />
          </span>
          <span className="font-heading text-lg tracking-tight">Guardian</span>
          <span className="hidden text-xs tracking-[0.18em] text-muted-foreground uppercase sm:inline">
            Multichain Scan
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href || (link.href === "/app" && pathname === "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/70">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Grades and patterns. Not a verdict, endorsement, or investment view.</p>
        <p>Solana · Ethereum · Base · Arbitrum · Robinhood Chain</p>
      </div>
    </footer>
  );
}
