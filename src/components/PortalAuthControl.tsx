import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { authClient } from "@/integrations/auth-client";
import {
  linkAuthenticatedWorker,
  setAccountPassword,
} from "@/lib/railway-admin.functions";

export function PortalAuthControl() {
  const { data: session } = authClient.useSession();
  const initial = session?.user.email?.trim().charAt(0).toUpperCase() || "U";
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const linkWorker = useServerFn(linkAuthenticatedWorker);
  const savePassword = useServerFn(setAccountPassword);
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;

    let active = true;
    linkWorker()
      .then(({ linkedWorkers }) => {
        if (active && linkedWorkers > 0) {
          toast.success(
            "Your verified sign-in is linked to the yard worker account.",
          );
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error(
          "Could not link the authenticated worker identity",
          error,
        );
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not link this account to a yard worker record.",
        );
      });

    return () => {
      active = false;
    };
  }, [linkWorker, userId]);

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) throw new Error(error.message ?? "Email sign-in failed.");
      setPassword("");
      setOpen(false);
      toast.success("Signed in successfully.");
    } catch (error) {
      console.error("Email sign-in failed", error);
      toast.error(
        error instanceof Error ? error.message : "Email sign-in failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.href,
      });
      if (error) throw new Error(error.message ?? "Google sign-in failed.");
    } catch (error) {
      console.error("Google sign-in failed", error);
      toast.error(
        error instanceof Error ? error.message : "Google sign-in failed.",
      );
      setBusy(false);
    }
  }

  async function addPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await savePassword({ data: { newPassword } });
      setNewPassword("");
      toast.success("Password saved. You can now sign in with email and password.");
    } catch (error) {
      console.error("Could not save password", error);
      toast.error(
        error instanceof Error ? error.message : "Could not save password.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Sign-out failed.");
      setOpen(false);
      toast.success("Signed out.");
      window.location.reload();
    } catch (error) {
      console.error("Sign-out failed", error);
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
        aria-label={
          session
            ? `Account menu for ${session.user.email ?? "signed-in user"}`
            : "Sign in"
        }
        className={`inline-flex h-10 shrink-0 items-center justify-center rounded-full border bg-card text-sm font-semibold shadow-sm outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${
          session ? "w-10" : "px-4"
        }`}
        title={session?.user.email ?? "Sign in"}
      >
        {session ? (
          <Avatar className="h-full w-full">
            <AvatarImage
              src={session.user.image ?? undefined}
              alt=""
              referrerPolicy="no-referrer"
            />
            <AvatarFallback aria-hidden="true" className="bg-transparent">
              {initial}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span>Sign in</span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {session ? "Your VroomLink account" : "Sign in to VroomLink"}
            </DialogTitle>
            <DialogDescription>
              {session
                ? "Protected portal actions use your verified identity and assigned role."
                : "Sign in with Google, or with email and password once you have added one. Yard access is granted only when your account is assigned to an active worker record."}
            </DialogDescription>
          </DialogHeader>
          {session ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border bg-muted p-3 text-sm">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={session.user.image ?? undefined}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                  <AvatarFallback>{initial}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  {session.user.name && (
                    <p className="truncate font-semibold">{session.user.name}</p>
                  )}
                  <p className="truncate">{session.user.email}</p>
                </div>
              </div>
              <form onSubmit={addPassword} className="space-y-3">
                <label className="block space-y-1 text-sm font-medium">
                  Add or reset an email password
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="h-10 w-full rounded-lg border px-4 text-sm font-semibold disabled:opacity-50"
                >
                  Save password
                </button>
              </form>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
