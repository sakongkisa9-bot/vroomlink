import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";

type PortalShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function PortalShell({ title, description, children }: PortalShellProps) {
  return (
    <div className="min-h-screen bg-muted/30">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/" className="text-sm font-medium text-primary hover:underline">
              ← Public marketplace
            </Link>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <span className="rounded-full border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Role workspace
          </span>
        </div>
        {children}
      </main>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
      {detail && <p className="mt-2 text-xs text-muted-foreground">{detail}</p>}
    </section>
  );
}
