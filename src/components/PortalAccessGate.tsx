import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { isBrowserSupabaseConfigured, supabase } from "@/integrations/client";
import { PortalAuthControl } from "@/components/PortalAuthControl";

export function PortalAccessGate({ children }: { children: ReactNode }) {
  const configured = isBrowserSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(configured);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!configured) {
      setChecking(false);
      return;
    }

    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) {
          console.error(
            "Could not verify the portal sign-in session",
            sessionError,
          );
          setError("We couldn't verify your sign-in. Please try again.");
        } else {
          setSession(data.session);
          setError("");
        }
        setChecking(false);
      })
      .catch((sessionError: unknown) => {
        if (!active) return;
        console.error(
          "Could not verify the portal sign-in session",
          sessionError,
        );
        setError("We couldn't verify your sign-in. Please try again.");
        setChecking(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setError("");
      setChecking(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [configured]);

  if (checking) {
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
              {error}
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
