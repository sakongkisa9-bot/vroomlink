import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MetricCard, PortalShell } from "@/components/PortalShell";
import { getSystemStatus } from "@/lib/catalog.functions";
import {
  createDealerAccount,
  getDeveloperDashboard,
  setRailwaySystemActive,
} from "@/lib/railway-admin.functions";
import { formatKsh } from "@/lib/format";

export const Route = createFileRoute("/developer")({
  loader: () => getSystemStatus(),
  head: () => ({ meta: [{ title: "Developer Admin Panel | VroomLink" }] }),
  component: DeveloperAdmin,
});

function DeveloperAdmin() {
  const { active: initialActive } = Route.useLoaderData();
  const router = useRouter();
  const setSystemActive = useServerFn(setRailwaySystemActive);
  const loadDashboard = useServerFn(getDeveloperDashboard);
  const saveDealer = useServerFn(createDealerAccount);
  const [active, setActive] = useState(initialActive);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dashboard, setDashboard] = useState<Awaited<
    ReturnType<typeof getDeveloperDashboard>
  > | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [accessStatus, setAccessStatus] = useState<
    "checking" | "denied" | "authorized"
  >("checking");
  const [accessError, setAccessError] = useState("");
  const [creatingDealer, setCreatingDealer] = useState(false);

  const refreshDashboard = useCallback(
    async (quiet = false) => {
      setLoadingDashboard(true);
      try {
        const result = await loadDashboard();
        setDashboard(result);
        setAccessStatus("authorized");
        setAccessError("");
        if (!quiet) toast.success("Super-admin access verified.");
      } catch (error) {
        setDashboard(null);
        setAccessStatus("denied");
        const message =
          error instanceof Error
            ? error.message
            : "Could not verify developer access.";
        setAccessError(message);
        if (!quiet) {
          console.error("Could not verify developer access", error);
          toast.error(message);
        }
      } finally {
        setLoadingDashboard(false);
      }
    },
    [loadDashboard],
  );

  useEffect(() => {
    void refreshDashboard(true);
  }, [refreshDashboard]);

  async function toggleSystem() {
    setBusy(true);
    try {
      const result = await setSystemActive({ data: { active: !active } });
      setActive(result.active);
      setConfirmOpen(false);
      toast.success(
        result.active
          ? "System routines are active."
          : "System routines shut down.",
      );
      await router.invalidate();
    } catch (error) {
      console.error("Could not change global system status", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update system status. Super-admin authentication is required.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function registerDealer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setCreatingDealer(true);
    try {
      await saveDealer({
        data: {
          showroomName: String(form.get("showroomName")),
          location: String(form.get("location")),
          slug: String(form.get("slug")),
          whatsappPhone: String(form.get("whatsappPhone")),
          ownerName: String(form.get("ownerName")),
          ownerEmail: String(form.get("ownerEmail")),
          subscriptionExpiresAt: new Date(
            String(form.get("subscriptionExpiresAt")),
          ).toISOString(),
        },
      });
      formElement.reset();
      toast.success("Dealer workspace and owner record created.");
      await refreshDashboard(true);
    } catch (error) {
      console.error("Could not create dealer account", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create dealer account.",
      );
    } finally {
      setCreatingDealer(false);
    }
  }

  const monthlyCashflow =
    dashboard?.payments.reduce(
      (sum, payment) => sum + Number(payment.amount_ksh),
      0,
    ) ?? 0;
  const activeSubscriptions =
    dashboard?.dealers.filter(
      (dealer) =>
        dealer.subscription_status === "ACTIVE" &&
        new Date(dealer.subscription_expires_at).getTime() > Date.now(),
    ).length ?? 0;

  return (
    <PortalShell
      title="Developer Admin Panel"
      description="Platform health, dealer subscriptions, and global maintenance controls."
    >
      {accessStatus === "checking" ? (
        <section className="rounded-2xl border bg-card p-8 text-center">
          <h2 className="text-lg font-semibold">
            Verifying administrator access…
          </h2>
        </section>
      ) : accessStatus === "denied" ? (
        <section className="mx-auto max-w-xl rounded-2xl border bg-card p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold">Developer access restricted</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with the VroomLink account assigned the super-admin role
            using the Sign in control in the header. A password in the page
            itself would not protect these operations.
          </p>
          {accessError && (
            <p className="mt-3 rounded-lg bg-muted p-3 text-left text-xs text-muted-foreground">
              {accessError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void refreshDashboard()}
            disabled={loadingDashboard}
            className="mt-5 h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loadingDashboard ? "Checking…" : "Verify super-admin access"}
          </button>
        </section>
      ) : (
        <>
          <section className="mb-8 rounded-2xl border-2 border-red-500 bg-red-50 p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">
                  Emergency control
                </p>
                <h2 className="mt-2 text-xl font-bold text-red-950">
                  {active
                    ? "Platform routines are active"
                    : "Platform is under maintenance"}
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-red-900">
                  Shutdown blocks standard catalog and write operations.
                  Re-enabling requires an authenticated super-admin account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="min-h-12 shrink-0 rounded-xl bg-red-700 px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
              >
                {active
                  ? "SHUT DOWN ALL SYSTEM ROUTINES"
                  : "RESTORE SYSTEM ROUTINES"}
              </button>
            </div>
          </section>

          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Platform overview</h2>
              <p className="text-sm text-muted-foreground">
                Live subscription and payment records are visible to verified
                super-admins.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshDashboard()}
              disabled={loadingDashboard}
              className="h-10 rounded-lg border bg-card px-4 text-sm font-semibold transition hover:bg-accent disabled:opacity-50"
            >
              {loadingDashboard
                ? "Loading…"
                : dashboard
                  ? "Refresh live data"
                  : "Load live data"}
            </button>
          </div>

          <section className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              label="Active Car Yard subscriptions"
              value={dashboard ? String(activeSubscriptions) : "—"}
              detail={
                dashboard
                  ? `${dashboard.dealers.length} registered yards`
                  : "Load live data to view"
              }
            />
            <MetricCard
              label="Monthly cashflow (KSh)"
              value={dashboard ? formatKsh(monthlyCashflow) : "—"}
              detail="Recorded subscription events this month"
            />
          </section>

          <section className="mt-8 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Register a car yard</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Creates the dealer workspace and its initial owner worker. The
              owner must sign in with this email to link their account.
            </p>
            <form
              onSubmit={(event) => void registerDealer(event)}
              className="mt-5 grid gap-4 sm:grid-cols-2"
            >
              <label className="space-y-1.5 text-sm font-medium">
                Showroom name
                <input
                  name="showroomName"
                  required
                  maxLength={120}
                  className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                Location
                <input
                  name="location"
                  required
                  maxLength={160}
                  placeholder="Westlands, Nairobi"
                  className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                Yard URL slug
                <input
                  name="slug"
                  required
                  maxLength={80}
                  pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*"
                  placeholder="westlands-prime"
                  className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                WhatsApp contact
                <input
                  name="whatsappPhone"
                  type="tel"
                  required
                  maxLength={24}
                  placeholder="254712345678"
                  className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                Owner full name
                <input
                  name="ownerName"
                  required
                  maxLength={160}
                  className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                Owner sign-in email
                <input
                  name="ownerEmail"
                  type="email"
                  required
                  maxLength={254}
                  className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
                Subscription expiry
                <input
                  name="subscriptionExpiresAt"
                  type="datetime-local"
                  required
                  className="h-10 w-full rounded-lg border bg-background px-3 font-normal sm:max-w-sm"
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={creatingDealer}
                  className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {creatingDealer
                    ? "Registering…"
                    : "Register dealer and owner"}
                </button>
              </div>
            </form>
          </section>

          <section className="mt-8 overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
              <div>
                <h2 className="text-lg font-semibold">
                  Car Yard subscriptions
                </h2>
                <p className="text-sm text-muted-foreground">
                  Current expiry status and registered locations.
                </p>
              </div>
              {dashboard && (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                  Live data
                </span>
              )}
            </div>
            {dashboard ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Showroom</th>
                      <th className="px-4 py-3 font-semibold">Location</th>
                      <th className="px-4 py-3 font-semibold">Subscription</th>
                      <th className="px-4 py-3 font-semibold">Expires</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dashboard.dealers.map((dealer) => {
                      const currentlyActive =
                        dealer.subscription_status === "ACTIVE" &&
                        new Date(dealer.subscription_expires_at).getTime() >
                          Date.now();
                      return (
                        <tr key={dealer.id}>
                          <td className="px-4 py-4 font-medium">
                            {dealer.showroom_name}
                          </td>
                          <td className="px-4 py-4">{dealer.location}</td>
                          <td className="px-4 py-4">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${currentlyActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                            >
                              {currentlyActive ? "Active" : "Expired"}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            {new Date(
                              dealer.subscription_expires_at,
                            ).toLocaleDateString("en-KE")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Dashboard records are private. Authenticate as a super-admin to
                load them.
              </div>
            )}
          </section>

          {dashboard && (
            <section className="mt-8 rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold">
                Monthly subscription cashflows
              </h2>
              <div className="mt-4 divide-y">
                {dashboard.payments.map((payment, index) => (
                  <div
                    key={`${payment.provider}-${payment.paid_at}-${index}`}
                    className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                  >
                    <span className="font-medium capitalize">
                      {payment.provider}
                    </span>
                    <span>{formatKsh(Number(payment.amount_ksh))}</span>
                    <span className="text-muted-foreground">
                      {new Date(payment.paid_at).toLocaleString("en-KE")}
                    </span>
                  </div>
                ))}
                {dashboard.payments.length === 0 && (
                  <p className="py-5 text-sm text-muted-foreground">
                    No subscription payments recorded this month.
                  </p>
                )}
              </div>
            </section>
          )}

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {active
                    ? "Shut down all system routines?"
                    : "Restore system routines?"}
                </DialogTitle>
                <DialogDescription>
                  {active
                    ? "The public marketplace and standard database operations will be blocked until a super-admin restores service."
                    : "This will restore normal platform access for active, authorized users."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="h-10 rounded-lg border px-4 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleSystem()}
                  className="h-10 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy
                    ? "Updating…"
                    : active
                      ? "Confirm shutdown"
                      : "Restore platform"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </PortalShell>
  );
}
