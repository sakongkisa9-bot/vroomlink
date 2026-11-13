import type { ReactNode } from "react";
import { authClient } from "@/integrations/auth-client";
import { PortalAuthControl } from "@/components/PortalAuthControl";

export function PortalAccessGate({ children }: { children: ReactNode }) {
  const { data: session, isPending, error } = authClient.useSession();

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <p role="status" className="text-sm text-muted-foreground">
          Checking sign-in…
        </p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <section className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">Sign in to continue</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This workspace is private. Sign in with your VroomLink account to
            continue.
          </p>
          {error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              We couldn&apos;t verify your sign-in. Please try again.
            </p>
          )}
          <div className="mt-6 flex justify-center">
            <PortalAuthControl />
          </div>
        </section>
      </main>
    );
  }

  return children;
}
