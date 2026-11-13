import { useState, type FormEvent, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { authClient } from "@/integrations/auth-client";
import { PortalAuthControl } from "@/components/PortalAuthControl";
import { changeTemporaryPassword } from "@/lib/railway-admin.functions";

function ChangeTemporaryPassword() {
  const changePassword = useServerFn(changeTemporaryPassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await changePassword({ data: { currentPassword, newPassword } });
      toast.success("Password updated.");
      window.location.reload();
    } catch (error) {
      console.error("Could not change the temporary password", error);
      toast.error(
        error instanceof Error ? error.message : "Could not change password.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-8 shadow-sm"
      >
        <h1 className="text-2xl font-bold">Set your own password</h1>
        <p className="text-sm text-muted-foreground">
          You signed in with a temporary password. Choose a new one that only
          you know to continue.
        </p>
        <label className="block space-y-1 text-sm font-medium">
          Temporary password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
          />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          New password (at least 8 characters)
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
          className="h-10 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </main>
  );
}

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

  if (session.user.mustChangePassword) return <ChangeTemporaryPassword />;

  return children;
}
