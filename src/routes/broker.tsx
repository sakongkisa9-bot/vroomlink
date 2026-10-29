import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { listPublicVehicles } from "@/lib/catalog.functions";
import { formatKsh } from "@/lib/format";
import { PortalShell, MetricCard } from "@/components/PortalShell";

const demoBrokerId = "demo-broker";

export const Route = createFileRoute("/broker")({
  loader: () => listPublicVehicles(),
  head: () => ({ meta: [{ title: "Broker Dashboard | VroomLink" }] }),
  component: BrokerDashboard,
});

function BrokerDashboard() {
  const vehicles = Route.useLoaderData();
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");

  async function copyReferralLink(vehicleId: string) {
    const url = new URL(`/cars/${vehicleId}`, window.location.origin);
    url.searchParams.set("ref", demoBrokerId);
    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success("Demo referral link copied");
    } catch (error) {
      console.error("Could not copy referral link", error);
      toast.error("Clipboard access is unavailable in this browser.");
    }
  }

  function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!leadName.trim() || !leadPhone.trim()) return;
    toast.success("Demo lead captured locally. Sign in to submit a real lead.");
    setLeadName("");
    setLeadPhone("");
  }

  return (
    <PortalShell
      title="Broker Dashboard"
      description="A mobile-first workspace for inventory, customer leads, and referrals."
    >
      <section className="grid gap-4 sm:grid-cols-2">
        <MetricCard
          label="Commissions Earned (KSh)"
          value="184,500"
          detail="Illustrative demo total · not an account balance"
        />
        <MetricCard
          label="Active Leads"
          value="3"
          detail="Sample leads · not loaded from a broker account"
        />
      </section>

      <section className="mt-8 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Private broker inventory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Commission and wholesale figures are illustrative placeholders, not live dealer pricing.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-semibold">Vehicle</th>
                <th className="px-3 py-3 font-semibold">Retail listing</th>
                <th className="px-3 py-3 font-semibold">Wholesale cost (demo)</th>
                <th className="px-3 py-3 font-semibold">Broker commission (demo)</th>
                <th className="px-3 py-3 font-semibold">Referral</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vehicles.map((vehicle) => {
                const wholesale = Math.round(vehicle.price_ksh * 0.94);
                const commission = Math.round(vehicle.price_ksh * 0.02);
                return (
                  <tr key={vehicle.id}>
                    <td className="px-3 py-4 font-medium">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </td>
                    <td className="px-3 py-4">{formatKsh(vehicle.price_ksh)}</td>
                    <td className="px-3 py-4">{formatKsh(wholesale)}</td>
                    <td className="px-3 py-4 font-semibold text-primary">
                      {formatKsh(commission)}
                    </td>
                    <td className="px-3 py-4">
                      <button
                        type="button"
                        onClick={() => void copyReferralLink(vehicle.id)}
                        className="rounded-lg border px-3 py-2 text-xs font-semibold transition hover:bg-accent"
                      >
                        Generate Referral Link
                      </button>
                    </td>
                  </tr>
                );
              })}
              {vehicles.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    No published vehicles are available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <form onSubmit={submitLead} className="mt-8 max-w-2xl rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Submit Customer Lead</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Preview form only. Submissions are not persisted in demo mode.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium">
            Customer name
            <input
              required
              value={leadName}
              onChange={(event) => setLeadName(event.target.value)}
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Phone number
            <input
              required
              value={leadPhone}
              onChange={(event) => setLeadPhone(event.target.value)}
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
            Vehicle of interest
            <select className="h-10 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring">
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          className="mt-5 h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          Submit demo lead
        </button>
      </form>
    </PortalShell>
  );
}
