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
import { StatusBadge } from "@/components/StatusBadge";
import { isBrowserSupabaseConfigured } from "@/integrations/client";
import {
  createCarWithImportCosts,
  deactivateDealerWorker,
  getDealerDashboard,
} from "@/lib/railway-admin.functions";
import { listPublicVehicles } from "@/lib/catalog.functions";
import { formatKsh, STATUS_LABEL } from "@/lib/format";

const demoDealerId = "11111111-1111-1111-1111-111111111111";

const pipeline = [
  { status: "purchased_japan", label: "Purchased (Japan)" },
  { status: "on_ocean", label: "On the Ocean" },
  { status: "port_clearing", label: "Port Clearing (Mombasa)" },
  { status: "in_yard", label: "In Yard (Westlands)" },
] as const;

const sampleStaff = [
  { id: "staff-owner-demo", name: "Alex Kamau", email: "alex@example.test", role: "Yard Owner" },
  { id: "staff-manager-demo", name: "Wanjiku Njeri", email: "wanjiku@example.test", role: "Yard Manager" },
  { id: "staff-sales-demo", name: "Brian Otieno", email: "brian@example.test", role: "Salesperson" },
];

const sampleLogs = [
  { timestamp: "Today · 09:42", email: "wanjiku@example.test", action: "Updated vehicle status", record: "CX5-2018" },
  { timestamp: "Yesterday · 16:10", email: "alex@example.test", action: "Added vehicle to inventory", record: "PRADO-2019" },
  { timestamp: "Yesterday · 11:35", email: "brian@example.test", action: "Registered customer lead", record: "LEAD-DEMO-03" },
];

export const Route = createFileRoute("/dealer")({
  loader: () => listPublicVehicles(),
  head: () => ({ meta: [{ title: "Car Dealer Console | VroomLink" }] }),
  component: DealerConsole,
});

function DealerConsole() {
  const vehicles = Route.useLoaderData();
  const [role, setRole] = useState<"manager" | "owner">("manager");
  const [section, setSection] = useState<"overview" | "staff">("overview");
  const [costingOpen, setCostingOpen] = useState(false);
  const [deactivated, setDeactivated] = useState<string[]>([]);
  const [liveDashboard, setLiveDashboard] = useState<
    Awaited<ReturnType<typeof getDealerDashboard>> | null
  >(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const loadDashboard = useServerFn(getDealerDashboard);
  const deactivateWorker = useServerFn(deactivateDealerWorker);
  const canAuthenticate = isBrowserSupabaseConfigured();

  async function loadOwnerDashboard() {
    setLoadingDashboard(true);
    try {
      setLiveDashboard(await loadDashboard({ data: { dealerId: demoDealerId } }));
      toast.success("Live dealer records loaded.");
    } catch (error) {
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
    try {
      await deactivateWorker({ data: { dealerId: demoDealerId, workerId } });
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

  function toggleStaff(id: string) {
    const alreadyDeactivated = deactivated.includes(id);
    setDeactivated((current) =>
      alreadyDeactivated ? current.filter((staffId) => staffId !== id) : [...current, id],
    );
    toast.success(
      alreadyDeactivated
        ? "Demo staff account reactivated locally."
        : "Demo staff account deactivated locally.",
    );
  }

  return (
    <PortalShell
      title="Car Dealer Console"
      description="Fleet operations, costing, staff, and yard audit overview."
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-4">
        <div>
          <p className="text-sm font-semibold">Preview workspace role</p>
          <p className="text-xs text-muted-foreground">This switch changes the demo view only.</p>
        </div>
        <div className="inline-flex rounded-xl border bg-muted p-1">
          <button
            type="button"
            onClick={() => {
              setRole("manager");
              setSection("overview");
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${role === "manager" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >
            Yard Manager
          </button>
          <button
            type="button"
            onClick={() => {
              setRole("owner");
              setSection("overview");
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${role === "owner" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >
            Yard Owner
          </button>
        </div>
      </div>

      {role === "manager" ? (
        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Vehicle import pipeline</h2>
              <p className="text-sm text-muted-foreground">Sample public inventory grouped by its current status.</p>
            </div>
            <button
              type="button"
              onClick={() => setCostingOpen(true)}
              disabled={!canAuthenticate}
              title={!canAuthenticate ? "Configure Supabase sign-in to save vehicle records." : undefined}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              {canAuthenticate ? "Vehicle Sourcing & Costing" : "Supabase sign-in required"}
            </button>
          </div>
          <div className="grid gap-4 xl:grid-cols-4">
            {pipeline.map((column) => {
              const columnVehicles = vehicles.filter((vehicle) => vehicle.status === column.status);
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
                            {vehicle.year} {vehicle.make} {vehicle.model}
                          </h4>
                          <StatusBadge status={vehicle.status} className="px-2 py-0.5 text-[10px]" />
                        </div>
                        <p className="mt-2 text-sm font-bold text-primary">{formatKsh(vehicle.price_ksh)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {vehicle.yard?.name ?? STATUS_LABEL[vehicle.status]}
                        </p>
                      </article>
                    ))}
                    {columnVehicles.length === 0 && (
                      <div className="rounded-xl border border-dashed bg-card/60 px-3 py-6 text-center text-xs text-muted-foreground">
                        No sample vehicles
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
            canAuthenticate={canAuthenticate}
          />
        </section>
      ) : (
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
          </div>
          {section === "overview" ? (
            <OwnerOverview
              vehicles={vehicles}
              liveLogs={liveDashboard?.logs ?? null}
              loading={loadingDashboard}
              canAuthenticate={canAuthenticate}
              onLoadLiveData={() => void loadOwnerDashboard()}
            />
          ) : (
            <StaffTable
              deactivated={deactivated}
              onToggle={toggleStaff}
              liveStaff={liveDashboard?.staff ?? null}
              loading={loadingDashboard}
              canAuthenticate={canAuthenticate}
              onLoadLiveData={() => void loadOwnerDashboard()}
              onDeactivateLiveWorker={(id) => void deactivateLiveWorker(id)}
            />
          )}
        </section>
      )}
    </PortalShell>
  );
}

function OwnerOverview({
  vehicles,
  liveLogs,
  loading,
  canAuthenticate,
  onLoadLiveData,
}: {
  vehicles: Awaited<ReturnType<typeof listPublicVehicles>>;
  liveLogs: Awaited<ReturnType<typeof getDealerDashboard>>["logs"] | null;
  loading: boolean;
  canAuthenticate: boolean;
  onLoadLiveData: () => void;
}) {
  const inventoryValue = vehicles.reduce((total, vehicle) => total + vehicle.price_ksh, 0);
  const bars = [42, 58, 46, 74, 61, 88];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Listed inventory value"
          value={formatKsh(inventoryValue)}
          detail="Calculated from public asking prices; not realized revenue"
        />
        <MetricCard label="Vehicles in inventory" value={String(vehicles.length)} detail="Current published listings" />
        <MetricCard label="Audit entries shown" value={String(sampleLogs.length)} detail="Illustrative demo rows" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Revenue overview</h2>
              <p className="text-sm text-muted-foreground">Illustrative monthly trend · not live revenue data</p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">Demo chart</span>
          </div>
          <div className="mt-8 flex h-48 items-end gap-3 border-b border-l px-3">
            {bars.map((height, index) => (
              <div key={index} className="flex h-full flex-1 items-end justify-center">
                <div
                  className="w-full max-w-12 rounded-t-md bg-primary/80"
                  style={{ height: `${height}%` }}
                  title={`Sample month ${index + 1}`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between pl-2 text-xs text-muted-foreground">
            {["May", "Jun", "Jul", "Aug", "Sep", "Oct"].map((month) => (
              <span key={month}>{month}</span>
            ))}
          </div>
        </div>

        <AuditTable
          logs={liveLogs}
          loading={loading}
          canAuthenticate={canAuthenticate}
          onLoadLiveData={onLoadLiveData}
        />
      </section>
    </div>
  );
}

function AuditTable({
  logs,
  loading,
  canAuthenticate,
  onLoadLiveData,
}: {
  logs: Awaited<ReturnType<typeof getDealerDashboard>>["logs"] | null;
  loading: boolean;
  canAuthenticate: boolean;
  onLoadLiveData: () => void;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">System Audit Logs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {logs ? "Live immutable audit records" : "Illustrative sample records"}
          </p>
        </div>
        <button
          type="button"
          onClick={onLoadLiveData}
          disabled={loading || !canAuthenticate}
          className="shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          {!canAuthenticate
            ? "Supabase sign-in required"
            : loading
              ? "Loading…"
              : logs
                ? "Refresh"
                : "Load live"}
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
          : sampleLogs.map((log) => (
              <article key={log.record} className="rounded-xl border p-3">
                <div className="flex flex-wrap justify-between gap-1 text-xs text-muted-foreground">
                  <span>{log.timestamp}</span>
                  <span>{log.email}</span>
                </div>
                <p className="mt-2 text-sm font-medium">{log.action}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">Record: {log.record}</p>
              </article>
            ))}
        {logs?.length === 0 && (
          <p className="py-3 text-sm text-muted-foreground">No audit entries recorded for this yard.</p>
        )}
      </div>
    </section>
  );
}

function StaffTable({
  deactivated,
  onToggle,
  liveStaff,
  loading,
  canAuthenticate,
  onLoadLiveData,
  onDeactivateLiveWorker,
}: {
  deactivated: string[];
  onToggle: (id: string) => void;
  liveStaff: Awaited<ReturnType<typeof getDealerDashboard>>["staff"] | null;
  loading: boolean;
  canAuthenticate: boolean;
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
        isLive: true,
      }))
    : sampleStaff.map((staff) => ({
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role:
          staff.role === "Yard Owner"
            ? "OWNER"
            : staff.role === "Yard Manager"
              ? "YARD_MANAGER"
              : "SALESPERSON",
        is_active: !deactivated.includes(staff.id),
        isLive: false,
      }));

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Manage Staff</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {liveStaff
            ? "Live staff records. Deactivation requires an authenticated yard owner."
            : "Sample roster for preview. Load live records to manage yard worker access."}
        </p>
      </div>
      <button
        type="button"
        onClick={onLoadLiveData}
        disabled={loading || !canAuthenticate}
        className="mb-4 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {!canAuthenticate
          ? "Supabase sign-in required"
          : loading
            ? "Loading…"
            : liveStaff
              ? "Refresh live staff"
              : "Load live staff"}
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
                      onClick={() =>
                        staff.isLive
                          ? onDeactivateLiveWorker(staff.id)
                          : onToggle(staff.id)
                      }
                      className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {inactive ? "Deactivated" : "Deactivate Account"}
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
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CostingDialog({
  open,
  onOpenChange,
  canAuthenticate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canAuthenticate: boolean;
}) {
  const saveCar = useServerFn(createCarWithImportCosts);
  const [busy, setBusy] = useState(false);
  const [costs, setCosts] = useState({ cif: 0, duty: 0, port: 0, transport: 0 });
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
          dealerId: demoDealerId,
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
        },
      });
      toast.success(`Vehicle saved. Total true cost: ${formatKsh(result.totalTrueCostKsh)}.`);
      onOpenChange(false);
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
            Costs total automatically. Saving requires Supabase sign-in and an authorized yard owner or manager.
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
          <div className="rounded-xl bg-muted p-4">
            <p className="text-sm font-medium text-muted-foreground">Total True Cost</p>
            <p className="mt-1 text-2xl font-bold text-primary">{formatKsh(total)}</p>
          </div>
          <button
            type="submit"
            disabled={busy || !canAuthenticate}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {!canAuthenticate
              ? "Supabase sign-in required"
              : busy
                ? "Saving…"
                : "Save vehicle and costs"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
