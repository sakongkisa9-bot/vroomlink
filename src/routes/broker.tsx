import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MetricCard, PortalShell } from "@/components/PortalShell";
import { formatKsh } from "@/lib/format";
import {
  getBrokerDashboard,
  submitBrokerLead,
} from "@/lib/railway-admin.functions";

export const Route = createFileRoute("/broker")({
  head: () => ({ meta: [{ title: "Broker Dashboard | VroomLink" }] }),
  component: BrokerDashboard,
});

function BrokerDashboard() {
  const loadDashboard = useServerFn(getBrokerDashboard);
  const saveLead = useServerFn(submitBrokerLead);
  const [dashboard, setDashboard] = useState<
    Awaited<ReturnType<typeof getBrokerDashboard>> | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCarId, setSelectedCarId] = useState("");

  async function refreshDashboard(showToast = true) {
    setLoading(true);
    try {
      const result = await loadDashboard();
      setDashboard(result);
      setSelectedCarId((current) =>
        result.cars.some((car) => car.id === current)
          ? current
          : result.cars[0]?.id ?? "",
      );
      if (showToast) toast.success("Live broker records loaded.");
    } catch (error) {
      setDashboard(null);
      console.error("Could not load broker dashboard", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load broker records. Sign in as an active salesperson.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyReferralLink(vehicleId: string) {
    if (!dashboard) return;
    const url = new URL(`/cars/${vehicleId}`, window.location.origin);
    url.searchParams.set("ref", dashboard.brokerWorkerId);
    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success("Referral link copied.");
    } catch (error) {
      console.error("Could not copy broker referral link", error);
      toast.error("Clipboard access is unavailable in this browser.");
    }
  }

  async function handleSubmitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCarId) {
      toast.error("Select an available broker-enabled vehicle.");
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSubmitting(true);
    try {
      await saveLead({
        data: {
          carId: selectedCarId,
          customerName: String(form.get("customerName")),
          customerPhone: String(form.get("customerPhone")),
        },
      });
      formElement.reset();
      toast.success("Customer lead saved.");
      await refreshDashboard(false);
    } catch (error) {
      console.error("Could not submit broker lead", error);
      toast.error(
        error instanceof Error ? error.message : "Could not save this customer lead.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell
      title="Broker Dashboard"
      description="Your private yard inventory, customer leads, and completed-sale commissions."
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Sign in with an active salesperson worker account to load your yard records.
        </p>
        <button
          type="button"
          onClick={() => void refreshDashboard()}
          disabled={loading}
          className="h-10 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? "Loading…" : dashboard ? "Refresh broker records" : "Load broker records"}
        </button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <MetricCard
          label="Commissions Earned (KSh)"
          value={dashboard ? formatKsh(Number(dashboard.commissionEarnedKsh)) : "—"}
          detail="Recorded only after a dealer completes a vehicle sale"
        />
        <MetricCard
          label="Active Leads"
          value={dashboard ? String(dashboard.activeLeadCount) : "—"}
          detail="Your new and contacted customer leads"
        />
      </section>

      <section className="mt-8 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Private broker inventory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Wholesale costs and commission rates are private yard records, not public catalog data.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-semibold">Vehicle</th>
                <th className="px-3 py-3 font-semibold">Retail listing</th>
                <th className="px-3 py-3 font-semibold">Wholesale cost</th>
                <th className="px-3 py-3 font-semibold">Commission rate</th>
                <th className="px-3 py-3 font-semibold">Referral</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dashboard?.cars.map((vehicle) => (
                <tr key={vehicle.id}>
                  <td className="px-3 py-4 font-medium">
                    {vehicle.year} {vehicle.brand} {vehicle.model}
                  </td>
                  <td className="px-3 py-4">{formatKsh(Number(vehicle.selling_price))}</td>
                  <td className="px-3 py-4">{formatKsh(Number(vehicle.wholesale_price))}</td>
                  <td className="px-3 py-4 font-semibold text-primary">
                    {Number(vehicle.broker_commission_rate_percent)}%
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
              ))}
              {dashboard?.cars.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    No active vehicles with broker terms are available in your yard.
                  </td>
                </tr>
              )}
              {!dashboard && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    Load your authenticated broker account to view private inventory.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={(event) => void handleSubmitLead(event)}
          className="rounded-2xl border bg-card p-5 shadow-sm"
        >
          <h2 className="text-xl font-semibold">Submit Customer Lead</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Customer contact details are visible only to this salesperson and authorized yard staff.
          </p>
          <div className="mt-5 space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              Customer name
              <input
                name="customerName"
                required
                maxLength={160}
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Phone number
              <input
                name="customerPhone"
                required
                maxLength={24}
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Vehicle of interest
              <select
                required
                value={selectedCarId}
                onChange={(event) => setSelectedCarId(event.target.value)}
                disabled={!dashboard?.cars.length}
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                {dashboard?.cars.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.year} {vehicle.brand} {vehicle.model}
                  </option>
                ))}
                {!dashboard?.cars.length && <option value="">No available vehicles</option>}
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={submitting || !dashboard?.cars.length}
            className="mt-5 h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Submit customer lead"}
          </button>
        </form>

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-xl font-semibold">My customer leads</h2>
          <div className="mt-4 space-y-3">
            {dashboard?.leads.map((lead) => (
              <article key={lead.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{lead.customer_name}</p>
                    <p className="text-sm text-muted-foreground">{lead.customer_phone}</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {lead.status}
                  </span>
                </div>
                <p className="mt-2 text-sm">
                  {lead.year} {lead.brand} {lead.model}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(lead.created_at).toLocaleString("en-KE")}
                </p>
              </article>
            ))}
            {dashboard?.leads.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                You have not submitted any customer leads yet.
              </p>
            )}
            {!dashboard && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Load your broker account to see customer leads.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Completed-sale commissions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Commission amounts are calculated by the database from each recorded final sale price.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-semibold">Vehicle</th>
                <th className="px-3 py-3 font-semibold">Final sale</th>
                <th className="px-3 py-3 font-semibold">Rate</th>
                <th className="px-3 py-3 font-semibold">Commission earned</th>
                <th className="px-3 py-3 font-semibold">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dashboard?.commissions.map((commission) => (
                <tr key={commission.id}>
                  <td className="px-3 py-4 font-medium">
                    {commission.year} {commission.brand} {commission.model}
                  </td>
                  <td className="px-3 py-4">{formatKsh(Number(commission.final_sale_price))}</td>
                  <td className="px-3 py-4">{Number(commission.commission_rate_percent)}%</td>
                  <td className="px-3 py-4 font-semibold text-primary">
                    {formatKsh(Number(commission.commission_amount))}
                  </td>
                  <td className="px-3 py-4">
                    {new Date(commission.sold_at).toLocaleDateString("en-KE")}
                  </td>
                </tr>
              ))}
              {dashboard?.commissions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No completed-sale commissions have been recorded.
                  </td>
                </tr>
              )}
              {!dashboard && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    Load your broker account to view commission records.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PortalShell>
  );
}
