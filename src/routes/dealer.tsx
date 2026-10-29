import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PortalShell, MetricCard } from "@/components/PortalShell";
import {
  createCarWithImportCosts,
  deactivateDealerWorker,
  getDealerDashboard,
  recordCompletedVehicleSale,
} from "@/lib/railway-admin.functions";
import { formatKsh } from "@/lib/format";

const pipeline = [
  { status: "PURCHASED", label: "Purchased (Japan)" },
  { status: "ON_OCEAN", label: "On the Ocean" },
  { status: "PORT_CLEARING", label: "Port Clearing (Mombasa)" },
  { status: "IN_YARD", label: "In Yard" },
] as const;

export const Route = createFileRoute("/dealer")({
  head: () => ({ meta: [{ title: "Car Dealer Console | VroomLink" }] }),
  component: DealerConsole,
});

function DealerConsole() {
  const [currentRole, setCurrentRole] = useState<"OWNER" | "YARD_MANAGER" | null>(
    null,
  );
  const [section, setSection] = useState<"overview" | "staff" | "sales">("overview");
  const [costingOpen, setCostingOpen] = useState(false);
  const [liveDashboard, setLiveDashboard] = useState<
    Awaited<ReturnType<typeof getDealerDashboard>> | null
  >(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const loadDashboard = useServerFn(getDealerDashboard);
  const deactivateWorker = useServerFn(deactivateDealerWorker);

  async function loadOwnerDashboard() {
    setLoadingDashboard(true);
    try {
      const dashboard = await loadDashboard({ data: {} });
      setLiveDashboard(dashboard);
      setCurrentRole(dashboard.currentRole);
      toast.success("Live dealer records loaded.");
    } catch (error) {
      setLiveDashboard(null);
      setCurrentRole(null);
      console.error("Could not load dealer owner data", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load records. Sign in as an authorized dealer worker.",
      );
    } finally {
      setLoadingDashboard(false);
    }
  }

  async function deactivateLiveWorker(workerId: string) {
    if (!liveDashboard) {
      toast.error("Load the authenticated yard staff list before deactivating a worker.");
      return;
    }

    try {
      await deactivateWorker({
        data: { dealerId: liveDashboard.dealerId, workerId },
      });
      setLiveDashboard((current) =>
        current
          ? {
              ...current,
              staff: current.staff.map((worker) =>
                worker.id === workerId ? { ...worker, is_active: false } : worker,
              ),
            }
          : current,
      );
      toast.success("Worker access deactivated.");
    } catch (error) {
      console.error("Could not deactivate dealer worker", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not deactivate worker. Owner access is required.",
      );
    }
  }

  return (
    <PortalShell
      title="Car Dealer Console"
      description="Fleet operations, costing, staff, and yard audit overview."
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-4">
        <div>
          <p className="text-sm font-semibold">
            {currentRole
              ? `Authenticated workspace · ${currentRole.replaceAll("_", " ")}`
              : "Load your assigned yard workspace"}
          </p>
          <p className="text-xs text-muted-foreground">
            Workspace permissions come from your linked, active worker account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadOwnerDashboard()}
          disabled={loadingDashboard}
          className="h-10 rounded-lg border bg-background px-4 text-sm font-semibold disabled:opacity-50"
        >
          {loadingDashboard ? "Loading…" : liveDashboard ? "Refresh workspace" : "Load workspace"}
        </button>
      </div>

      {currentRole === "YARD_MANAGER" && liveDashboard ? (
        <section>
          <div className="mb-5 flex gap-2 border-b">
            <button
              type="button"
              onClick={() => setSection("overview")}
              className={`border-b-2 px-3 py-2 text-sm font-semibold ${section === "overview" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            >
              Vehicle pipeline
            </button>
            <button
              type="button"
              onClick={() => setSection("sales")}
              className={`border-b-2 px-3 py-2 text-sm font-semibold ${section === "sales" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            >
              Completed sales
            </button>
          </div>
          {section === "sales" ? (
            <SalesManagement
              dashboard={liveDashboard}
              onSaved={() => void loadOwnerDashboard()}
            />
          ) : (
            <>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Vehicle import pipeline</h2>
              <p className="text-sm text-muted-foreground">Your yard fleet grouped by its current import status.</p>
            </div>
            <button
              type="button"
              onClick={() => setCostingOpen(true)}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Vehicle Sourcing &amp; Costing
            </button>
          </div>
          <div className="grid gap-4 xl:grid-cols-4">
            {pipeline.map((column) => {
              const columnVehicles = liveDashboard.cars.filter(
                (vehicle) => vehicle.status_badge === column.status,
              );
              return (
                <section key={column.status} className="min-w-0 rounded-2xl border bg-muted/50 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2 px-1">
                    <h3 className="text-sm font-semibold">{column.label}</h3>
                    <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                      {columnVehicles.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {columnVehicles.map((vehicle) => (
                      <article key={vehicle.id} className="rounded-xl border bg-card p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-semibold">
                            {vehicle.year} {vehicle.brand} {vehicle.model}
                          </h4>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {column.label}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-bold text-primary">
                          {formatKsh(Number(vehicle.selling_price))}
                        </p>
                        {vehicle.chassis_number && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Chassis: {vehicle.chassis_number}
                          </p>
                        )}
                      </article>
                    ))}
                    {columnVehicles.length === 0 && (
                      <div className="rounded-xl border border-dashed bg-card/60 px-3 py-6 text-center text-xs text-muted-foreground">
                        No vehicles at this stage
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          <CostingDialog
            open={costingOpen}
            onOpenChange={setCostingOpen}
            onSaved={() => void loadOwnerDashboard()}
          />
            </>
          )}
        </section>
      ) : currentRole === "OWNER" && liveDashboard ? (
        <section>
          <div className="mb-5 flex gap-2 border-b">
            <button
              type="button"
              onClick={() => setSection("overview")}
              className={`border-b-2 px-3 py-2 text-sm font-semibold ${section === "overview" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            >
              Owner Overview
            </button>
            <button
              type="button"
              onClick={() => setSection("staff")}
              className={`border-b-2 px-3 py-2 text-sm font-semibold ${section === "staff" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            >
              Manage Staff
            </button>
            <button
              type="button"
              onClick={() => setSection("sales")}
              className={`border-b-2 px-3 py-2 text-sm font-semibold ${section === "sales" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            >
              Completed Sales
            </button>
          </div>
          {section === "overview" ? (
            <OwnerOverview
              liveCars={liveDashboard?.cars ?? null}
              liveLogs={liveDashboard?.logs ?? null}
              loading={loadingDashboard}
              onLoadLiveData={() => void loadOwnerDashboard()}
            />
          ) : section === "staff" ? (
            <StaffTable
              liveStaff={liveDashboard?.staff ?? null}
              loading={loadingDashboard}
              onLoadLiveData={() => void loadOwnerDashboard()}
              onDeactivateLiveWorker={(id) => void deactivateLiveWorker(id)}
            />
          ) : (
            <SalesManagement
              dashboard={liveDashboard}
              onSaved={() => void loadOwnerDashboard()}
            />
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <h2 className="text-lg font-semibold">Yard access required</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with an email matching an active yard worker record, then load your workspace.
            Protected operations verify your role on the server.
          </p>
        </section>
      )}
    </PortalShell>
  );
}

function SalesManagement({
  dashboard,
  onSaved,
}: {
  dashboard: Awaited<ReturnType<typeof getDealerDashboard>>;
  onSaved: () => void;
}) {
  const saveSale = useServerFn(recordCompletedVehicleSale);
  const [busy, setBusy] = useState(false);
  const availableCars = dashboard.cars;
  const activeSalespeople = dashboard.staff.filter(
    (worker) => worker.workspace_role === "SALESPERSON" && worker.is_active,
  );

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    try {
      const result = await saveSale({
        data: {
          carId: String(form.get("carId")),
          brokerWorkerId: String(form.get("brokerWorkerId") ?? "") || null,
          finalSalePrice: Number(form.get("finalSalePrice")),
        },
      });
      toast.success(
        `Completed sale recorded. Broker commission: ${formatKsh(result.commissionAmountKsh)}.`,
      );
      formElement.reset();
      onSaved();
    } catch (error) {
      console.error("Could not record completed vehicle sale", error);
      toast.error(
        error instanceof Error ? error.message : "Could not record completed vehicle sale.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={(event) => void submitSale(event)} className="max-w-3xl rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Record a completed sale</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The database snapshots the vehicle&apos;s configured commission rate and calculates commission from the final sale price.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="space-y-1.5 text-sm font-medium">
            Vehicle
            <select
              name="carId"
              required
              disabled={availableCars.length === 0}
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal disabled:opacity-50"
            >
              {availableCars.map((car) => (
                <option key={car.id} value={car.id}>
                  {car.year} {car.brand} {car.model}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Referred salesperson
            <select
              name="brokerWorkerId"
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
            >
              <option value="">No broker attribution</option>
              {activeSalespeople.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Final sale price (KSh)
            <input
              name="finalSalePrice"
              type="number"
              min="1"
              step="1"
              required
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy || availableCars.length === 0}
          className="mt-5 h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Recording…" : "Record completed sale"}
        </button>
        {availableCars.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            No unsold vehicles are available to record.
          </p>
        )}
      </form>

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Completed sales</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-semibold">Vehicle</th>
                <th className="px-3 py-3 font-semibold">Sale price</th>
                <th className="px-3 py-3 font-semibold">Broker</th>
                <th className="px-3 py-3 font-semibold">Rate</th>
                <th className="px-3 py-3 font-semibold">Commission</th>
                <th className="px-3 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dashboard.sales.map((sale) => (
                <tr key={sale.id}>
                  <td className="px-3 py-4 font-medium">
                    {sale.year} {sale.brand} {sale.model}
                  </td>
                  <td className="px-3 py-4">{formatKsh(Number(sale.final_sale_price))}</td>
                  <td className="px-3 py-4">{sale.broker_name ?? "—"}</td>
                  <td className="px-3 py-4">{Number(sale.commission_rate_percent)}%</td>
                  <td className="px-3 py-4 font-semibold text-primary">
                    {formatKsh(Number(sale.commission_amount))}
                  </td>
                  <td className="px-3 py-4">
                    {new Date(sale.sold_at).toLocaleDateString("en-KE")}
                  </td>
                </tr>
              ))}
              {dashboard.sales.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No completed sales have been recorded for this yard.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function OwnerOverview({
  liveCars,
  liveLogs,
  loading,
  onLoadLiveData,
}: {
  liveCars: Awaited<ReturnType<typeof getDealerDashboard>>["cars"] | null;
  liveLogs: Awaited<ReturnType<typeof getDealerDashboard>>["logs"] | null;
  loading: boolean;
  onLoadLiveData: () => void;
}) {
  const inventoryValue =
    liveCars?.reduce((total, car) => total + Number(car.selling_price), 0) ?? 0;
  const statuses = [
    { key: "PURCHASED", label: "Purchased (Japan)" },
    { key: "ON_OCEAN", label: "On the Ocean" },
    { key: "PORT_CLEARING", label: "Port Clearing" },
    { key: "IN_YARD", label: "In Yard" },
  ] as const;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Yard listed inventory value"
          value={liveCars ? formatKsh(inventoryValue) : "—"}
          detail="Current asking prices for this yard"
        />
        <MetricCard
          label="Vehicles in yard fleet"
          value={liveCars ? String(liveCars.length) : "—"}
          detail="Load live data to view"
        />
        <MetricCard
          label="Audit entries shown"
          value={liveLogs ? String(liveLogs.length) : "—"}
          detail={liveLogs ? "Live immutable records" : "Load live data to view"}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Fleet pipeline</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {liveCars ? "Live vehicle counts by import stage" : "Load live data to view this yard's fleet"}
          </p>
          <div className="mt-4 space-y-3">
            {statuses.map((status) => {
              const count =
                liveCars?.filter((car) => car.status_badge === status.key).length ?? 0;
              return (
                <div key={status.key} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span>{status.label}</span>
                  <span className="font-semibold">{liveCars ? count : "—"}</span>
                </div>
              );
            })}
          </div>
        </div>

        <AuditTable
          logs={liveLogs}
          loading={loading}
          onLoadLiveData={onLoadLiveData}
        />
      </section>
    </div>
  );
}

function AuditTable({
  logs,
  loading,
  onLoadLiveData,
}: {
  logs: Awaited<ReturnType<typeof getDealerDashboard>>["logs"] | null;
  loading: boolean;
  onLoadLiveData: () => void;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">System Audit Logs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {logs ? "Live immutable audit records" : "Live records not loaded"}
          </p>
        </div>
        <button
          type="button"
          onClick={onLoadLiveData}
          disabled={loading}
          className="shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          {loading ? "Loading…" : logs ? "Refresh" : "Load live"}
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {logs
          ? logs.map((log) => (
              <article key={log.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap justify-between gap-1 text-xs text-muted-foreground">
                  <span>{new Date(log.timestamp).toLocaleString("en-KE")}</span>
                  <span>{log.worker_email}</span>
                </div>
                <p className="mt-2 text-sm font-medium">{log.action_performed}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">Record: {log.record_id}</p>
              </article>
            ))
          : <p className="py-3 text-sm text-muted-foreground">Load live audit records to view this yard's activity.</p>}
        {logs?.length === 0 && (
          <p className="py-3 text-sm text-muted-foreground">No audit entries recorded for this yard.</p>
        )}
      </div>
    </section>
  );
}

function StaffTable({
  liveStaff,
  loading,
  onLoadLiveData,
  onDeactivateLiveWorker,
}: {
  liveStaff: Awaited<ReturnType<typeof getDealerDashboard>>["staff"] | null;
  loading: boolean;
  onLoadLiveData: () => void;
  onDeactivateLiveWorker: (id: string) => void;
}) {
  const staffRows = liveStaff
    ? liveStaff.map((staff) => ({
        id: staff.id,
        name: staff.full_name,
        email: staff.email,
        role: staff.workspace_role,
        is_active: staff.is_active,
      }))
    : [];

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Manage Staff</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {liveStaff
            ? "Live staff records. Deactivation requires an authenticated yard owner."
            : "Load live staff records to manage this yard's worker access."}
        </p>
      </div>
      <button
        type="button"
        onClick={onLoadLiveData}
        disabled={loading}
        className="mb-4 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {loading ? "Loading…" : liveStaff ? "Refresh live staff" : "Load live staff"}
      </button>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-semibold">Name</th>
              <th className="px-3 py-3 font-semibold">Email</th>
              <th className="px-3 py-3 font-semibold">Role</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {staffRows.map((staff) => {
              const inactive = !staff.is_active;
              const owner = staff.role === "OWNER";
              return (
                <tr key={staff.id}>
                  <td className="px-3 py-4 font-medium">{staff.name}</td>
                  <td className="px-3 py-4">{staff.email}</td>
                  <td className="px-3 py-4">{staff.role.replaceAll("_", " ")}</td>
                  <td className="px-3 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${inactive ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                      {inactive ? "Deactivated" : "Active"}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <button
                      type="button"
                      disabled={owner || inactive}
                      onClick={() => onDeactivateLiveWorker(staff.id)}
                      className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {inactive
                        ? "Deactivated"
                        : "Deactivate Account"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {liveStaff?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No workers are registered for this yard.
                </td>
              </tr>
            )}
            {liveStaff === null && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Load live staff records to see available accounts.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CostingDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const saveCar = useServerFn(createCarWithImportCosts);
  const [busy, setBusy] = useState(false);
  const [costs, setCosts] = useState({ cif: 0, duty: 0, port: 0, transport: 0 });
  const [tradeTerms, setTradeTerms] = useState({ wholesalePrice: "", commissionRate: "" });
  const total = costs.cif + costs.duty + costs.port + costs.transport;

  function updateCost(key: keyof typeof costs, value: string) {
    setCosts((current) => ({ ...current, [key]: Number(value) || 0 }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await saveCar({
        data: {
          brand: String(form.get("brand")),
          model: String(form.get("model")),
          year: Number(form.get("year")),
          mileageKm: 0,
          engineCc: null,
          transmission: "Automatic",
          fuel: "Petrol",
          sellingPrice: Number(form.get("sellingPrice")),
          bookingDepositKsh: 100000,
          statusBadge: "PURCHASED",
          chassisNumber: String(form.get("chassisNumber") || "") || null,
          cifPurchasePrice: costs.cif,
          kraImportDuty: costs.duty,
          portClearanceFees: costs.port,
          flatbedTransport: costs.transport,
          brokerWholesalePrice: Number(tradeTerms.wholesalePrice),
          brokerCommissionRatePercent: Number(tradeTerms.commissionRate),
        },
      });
      toast.success(`Vehicle saved. Total true cost: ${formatKsh(result.totalTrueCostKsh)}.`);
      onOpenChange(false);
      onSaved();
    } catch (error) {
      console.error("Could not save vehicle sourcing and import costs", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save vehicle. Sign in as an authorized dealer manager.",
      );
    } finally {
      setBusy(false);
    }
  }

  const costInputs = [
    { key: "cif" as const, label: "CIF Price (KSh)" },
    { key: "duty" as const, label: "KRA Duty (KSh)" },
    { key: "port" as const, label: "Port Fees (KSh)" },
    { key: "transport" as const, label: "Local Transport (KSh)" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vehicle Sourcing &amp; Costing</DialogTitle>
          <DialogDescription>
            Costs total automatically. Saving requires a signed-in yard owner or manager.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              Brand
              <input name="brand" required className="h-10 w-full rounded-lg border bg-background px-3 font-normal" />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Model
              <input name="model" required className="h-10 w-full rounded-lg border bg-background px-3 font-normal" />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Year
              <input name="year" type="number" min="1900" max="2100" required className="h-10 w-full rounded-lg border bg-background px-3 font-normal" />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Selling price (KSh)
              <input name="sellingPrice" type="number" min="1" required className="h-10 w-full rounded-lg border bg-background px-3 font-normal" />
            </label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">
              Chassis number
              <input name="chassisNumber" className="h-10 w-full rounded-lg border bg-background px-3 font-normal" />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {costInputs.map(({ key, label }) => (
              <label key={key} className="space-y-1 text-sm font-medium">
                {label}
                <input
                  type="number"
                  min="0"
                  value={costs[key] || ""}
                  onChange={(event) => updateCost(key, event.target.value)}
                  className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
                />
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              Broker wholesale price (KSh)
              <input
                type="number"
                min="0"
                step="1"
                required
                value={tradeTerms.wholesalePrice}
                onChange={(event) =>
                  setTradeTerms((current) => ({
                    ...current,
                    wholesalePrice: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Broker commission rate (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={tradeTerms.commissionRate}
                onChange={(event) =>
                  setTradeTerms((current) => ({
                    ...current,
                    commissionRate: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              />
            </label>
          </div>
          <div className="rounded-xl bg-muted p-4">
            <p className="text-sm font-medium text-muted-foreground">Total True Cost</p>
            <p className="mt-1 text-2xl font-bold text-primary">{formatKsh(total)}</p>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save vehicle and costs"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
