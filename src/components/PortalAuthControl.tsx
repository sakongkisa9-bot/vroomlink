import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isBrowserSupabaseConfigured, supabase } from "@/integrations/client";
import { linkAuthenticatedWorker } from "@/lib/railway-admin.functions";

export function PortalAuthControl() {
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const linkWorker = useServerFn(linkAuthenticatedWorker);
  const configured = isBrowserSupabaseConfigured();

  useEffect(() => {
    if (!configured) return;

    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("Could not restore the Supabase session", error);
        toast.error("Could not restore your sign-in session.");
        return;
      }
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [configured]);

  useEffect(() => {
    if (!session?.user) return;

    let active = true;
    void linkWorker()
      .then(({ linkedWorkers }) => {
        if (active && linkedWorkers > 0) {
          toast.success("Your verified sign-in is linked to the yard worker account.");
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Could not link the authenticated worker identity", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not link this account to a yard worker record.",
        );
      });

    return () => {
      active = false;
    };
  }, [linkWorker, session?.user.id]);

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setPassword("");
      setOpen(false);
      toast.success("Signed in successfully.");
    } catch (error) {
      console.error("Supabase email sign-in failed", error);
      toast.error(error instanceof Error ? error.message : "Email sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendEmailLink() {
    if (!email.trim()) {
      toast.error("Enter your email address first.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.href },
      });
      if (error) throw error;
      toast.success("Check your email for a secure sign-in link.");
    } catch (error) {
      console.error("Supabase email-link sign-in failed", error);
      toast.error(error instanceof Error ? error.message : "Could not send a sign-in link.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href },
      });
      if (error) throw error;
    } catch (error) {
      console.error("Supabase Google sign-in failed", error);
      toast.error(error instanceof Error ? error.message : "Google sign-in failed.");
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSession(null);
      setOpen(false);
      toast.success("Signed out.");
      window.location.reload();
    } catch (error) {
      console.error("Supabase sign-out failed", error);
      toast.error(error instanceof Error ? error.message : "Sign-out failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 max-w-48 shrink-0 items-center rounded-full border bg-card px-4 text-sm font-semibold shadow-sm outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        title={session?.user.email ?? "Sign in"}
      >
        <span className="truncate">
          {session?.user.email ?? "Sign in"}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{session ? "Your VroomLink account" : "Sign in to VroomLink"}</DialogTitle>
            <DialogDescription>
              {session
                ? "Protected portal actions use your verified Supabase identity and assigned role."
                : "Sign in with email or Google. Yard access is granted only when your account is assigned to an active worker record."}
            </DialogDescription>
          </DialogHeader>
          {!configured ? (
            <p className="rounded-lg border bg-muted p-3 text-sm text-muted-foreground">
              Supabase browser configuration is missing. Set the VITE_SUPABASE_URL and
              VITE_SUPABASE_PUBLISHABLE_KEY build variables, then rebuild the client.
            </p>
          ) : session ? (
            <div className="space-y-4">
              <p className="rounded-lg border bg-muted p-3 text-sm">{session.user.email}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void signOut()}
                className="h-10 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Signing out…" : "Sign out"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => void signInWithGoogle()}
                className="h-10 w-full rounded-lg border px-4 text-sm font-semibold disabled:opacity-50"
              >
                Continue with Google
              </button>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or use email
                <span className="h-px flex-1 bg-border" />
              </div>
              <form onSubmit={signInWithPassword} className="space-y-3">
                <label className="block space-y-1 text-sm font-medium">
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
                  />
                </label>
                <label className="block space-y-1 text-sm font-medium">
                  Password
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="h-10 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {busy ? "Signing in…" : "Sign in with email"}
                </button>
              </form>
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendEmailLink()}
                className="w-full text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
              >
                Send me a secure email sign-in link
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
