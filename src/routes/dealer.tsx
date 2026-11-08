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
  createDealerWorker,
  createCarWithImportCosts,
  createVehicleImageUploadUrls,
  deleteVehicleImageUploads,
  deactivateDealerWorker,
  getDealerDashboard,
  recordCompletedVehicleSale,
  updateDealerCar,
} from "@/lib/railway-admin.functions";
import { formatKsh } from "@/lib/format";
import { supabase } from "@/integrations/client";
import { getSupabaseAuthHeaders } from "@/integrations/supabase-auth-headers";
import { YardQrCodeButton } from "@/components/YardQrCodeButton";

const pipeline = [
  { status: "PURCHASED", label: "Purchased (Japan)" },
  { status: "ON_OCEAN", label: "On the Ocean" },
  { status: "PORT_CLEARING", label: "Port Clearing (Mombasa)" },
  { status: "IN_YARD", label: "In Yard" },
] as const;

function isVehicleImageContentType(
  type: string,
): type is "image/jpeg" | "image/png" | "image/webp" {
  return type === "image/jpeg" || type === "image/png" || type === "image/webp";
}

export const Route = createFileRoute("/dealer")({
  head: () => ({ meta: [{ title: "Car Dealer Console | VroomLink" }] }),
  component: () => <DealerWorkspace expectedRole="OWNER" />,
});

export function DealerWorkspace({
  expectedRole,
}: {
  expectedRole: "OWNER" | "SALESPERSON";
}) {
  const [currentRole, setCurrentRole] = useState<
    "OWNER" | "YARD_MANAGER" | "SALESPERSON" | "BROKER" | null
  >(null);
  const [section, setSection] = useState<
    "overview" | "inventory" | "staff" | "sales"
  >(expectedRole === "OWNER" ? "overview" : "inventory");
  const [costingOpen, setCostingOpen] = useState(false);
  const [liveDashboard, setLiveDashboard] = useState<Awaited<
    ReturnType<typeof getDealerDashboard>
  > | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const loadDashboard = useServerFn(getDealerDashboard);
  const deactivateWorker = useServerFn(deactivateDealerWorker);
  const addWorker = useServerFn(createDealerWorker);
  const [creatingWorker, setCreatingWorker] = useState(false);

  async function loadOwnerDashboard() {
    setLoadingDashboard(true);
    try {
      const headers = await getSupabaseAuthHeaders();
      const dashboard = await loadDashboard({
        data: { workspaceRole: expectedRole },
        headers,
      });
      setLiveDashboard(dashboard);
      setCurrentRole(dashboard.currentRole);
      if (dashboard.currentRole !== expectedRole) {
        setLiveDashboard(null);
        setCurrentRole(null);
        throw new Error(
          `Sign in with an active ${expectedRole === "OWNER" ? "yard owner" : "salesperson"} account to open this page.`,
        );
      }
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

  async function createLiveWorker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!liveDashboard || currentRole !== "OWNER") {
      toast.error("Load the yard as an owner before adding staff.");
      return;
    }

    const form = new FormData(formElement);
    setCreatingWorker(true);
    try {
      const headers = await getSupabaseAuthHeaders();
      const name = String(form.get("workerName")).trim();
      const email = String(form.get("workerEmail")).trim();
      const workspaceRole = String(form.get("workspaceRole"));
      if (workspaceRole !== "BROKER" && workspaceRole !== "SALESPERSON") {
        throw new Error("Choose either the broker or salesperson role.");
      }
      const result = await addWorker({
        data: {
          dealerId: liveDashboard.dealerId,
          fullName: name,
          email,
          workspaceRole,
        },
        headers,
      });
      setLiveDashboard((current) =>
        current
          ? {
              ...current,
              staff: [
                ...current.staff,
                {
                  id: result.workerId,
                  full_name: name,
                  email,
                  workspace_role: workspaceRole,
                  is_active: true,
                },
              ],
            }
          : current,
      );
      formElement.reset();
      toast.success(
        `${workspaceRole === "BROKER" ? "Broker" : "Salesperson"} added. They can sign in using this email.`,
      );
    } catch (error) {
      console.error("Could not add dealer staff", error);
      toast.error(
        error instanceof Error ? error.message : "Could not add staff.",
      );
    } finally {
      setCreatingWorker(false);
    }
  }

  async function deactivateLiveWorker(workerId: string) {
    if (!liveDashboard) {
      toast.error(
        "Load the authenticated yard staff list before deactivating a worker.",
      );
      return;
    }

    try {
      const headers = await getSupabaseAuthHeaders();
      await deactivateWorker({
        data: { dealerId: liveDashboard.dealerId, workerId },
        headers,
      });
      setLiveDashboard((current) =>
        current
          ? {
              ...current,
              staff: current.staff.map((worker) =>
                worker.id === workerId
                  ? { ...worker, is_active: false }
                  : worker,
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
      title={
        expectedRole === "OWNER" ? "Owner Workspace" : "Salesperson Workspace"
      }
      description={
        expectedRole === "OWNER"
          ? "Manage staff, yard inventory, sales, and all yard activity."
          : "Add and update vehicle listings, record sales, and share this yard's marketplace."
      }
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-4">
        <div>
          <p className="text-sm font-semibold">
            {currentRole
              ? `Authenticated workspace · ${expectedRole}`
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
          {loadingDashboard
            ? "Loading…"
            : liveDashboard
              ? "Refresh workspace"
              : "Load workspace"}
        </button>
        {expectedRole === "SALESPERSON" && liveDashboard && (
          <YardQrCodeButton
            yardName={liveDashboard.yardName}
            slug={liveDashboard.yardSlug}
          />
        )}
      </div>

      {currentRole === expectedRole && liveDashboard ? (
        <section>
          <div className="mb-5 flex gap-2 border-b">
            {expectedRole === "OWNER" && (
              <>
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
              </>
            )}
            <button
              type="button"
              onClick={() => setSection("inventory")}
              className={`border-b-2 px-3 py-2 text-sm font-semibold ${section === "inventory" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            >
              Vehicle Inventory
            </button>
            <button
              type="button"
              onClick={() => setSection("sales")}
              className={`border-b-2 px-3 py-2 text-sm font-semibold ${section === "sales" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            >
              Completed Sales
            </button>
          </div>
          {expectedRole === "OWNER" && section === "overview" ? (
            <OwnerOverview
              liveCars={liveDashboard?.cars ?? null}
              liveLogs={liveDashboard?.logs ?? null}
              loading={loadingDashboard}
              onLoadLiveData={() => void loadOwnerDashboard()}
            />
          ) : expectedRole === "OWNER" && section === "staff" ? (
            <StaffTable
              liveStaff={liveDashboard?.staff ?? null}
              loading={loadingDashboard}
              canManageStaff={currentRole === "OWNER"}
              creatingWorker={creatingWorker}
              onCreateWorker={(event) => void createLiveWorker(event)}
              onLoadLiveData={() => void loadOwnerDashboard()}
              onDeactivateLiveWorker={(id) => void deactivateLiveWorker(id)}
            />
          ) : section === "inventory" ? (
            <InventoryManagement
              dashboard={liveDashboard}
              onAddVehicle={() => setCostingOpen(true)}
              onSaved={() => void loadOwnerDashboard()}
            />
          ) : (
            <SalesManagement
              dashboard={liveDashboard}
              onSaved={() => void loadOwnerDashboard()}
            />
          )}
          <CostingDialog
            open={costingOpen}
            onOpenChange={setCostingOpen}
            onSaved={() => void loadOwnerDashboard()}
          />
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <h2 className="text-lg font-semibold">
            {expectedRole === "OWNER"
              ? "Owner access required"
              : "Salesperson access required"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with an email matching an active{" "}
            {expectedRole === "OWNER" ? "owner" : "salesperson"} account for a
            car yard, then load this workspace.
          </p>
        </section>
      )}
    </PortalShell>
  );
}

function InventoryManagement({
  dashboard,
  onAddVehicle,
  onSaved,
}: {
  dashboard: Awaited<ReturnType<typeof getDealerDashboard>>;
  onAddVehicle: () => void;
  onSaved: () => void;
}) {
  const [editingVehicle, setEditingVehicle] = useState<
    (typeof dashboard.cars)[number] | null
  >(null);

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Vehicle inventory</h2>
          <p className="text-sm text-muted-foreground">
            Add vehicles and update their prices and import details.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddVehicle}
          className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          Add vehicle
        </button>
      </div>
      <div className="grid gap-4 xl:grid-cols-4">
        {pipeline.map((column) => {
          const vehicles = dashboard.cars.filter(
            (vehicle) => vehicle.status_badge === column.status,
          );
          return (
            <section
              key={column.status}
              className="min-w-0 rounded-2xl border bg-muted/50 p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <h3 className="text-sm font-semibold">{column.label}</h3>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                  {vehicles.length}
                </span>
              </div>
              <div className="space-y-3">
                {vehicles.map((vehicle) => (
                  <article
                    key={vehicle.id}
                    className="rounded-xl border bg-card p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold">
                          {vehicle.year} {vehicle.brand} {vehicle.model}
                        </h4>
                        <p className="mt-2 text-sm font-bold text-primary">
                          {formatKsh(Number(vehicle.selling_price))}
                        </p>
                        {vehicle.chassis_number && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Chassis: {vehicle.chassis_number}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingVehicle(vehicle)}
                        className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                      >
                        Edit
                      </button>
                    </div>
                  </article>
                ))}
                {vehicles.length === 0 && (
                  <div className="rounded-xl border border-dashed bg-card/60 px-3 py-6 text-center text-xs text-muted-foreground">
                    No vehicles at this stage
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {editingVehicle && (
        <EditVehicleDialog
          key={editingVehicle.id}
          vehicle={editingVehicle}
          onOpenChange={(open) => {
            if (!open) setEditingVehicle(null);
          }}
          onSaved={() => {
            setEditingVehicle(null);
            onSaved();
          }}
        />
      )}
    </section>
  );
}

function EditVehicleDialog({
  vehicle,
  onOpenChange,
  onSaved,
}: {
  vehicle: Awaited<ReturnType<typeof getDealerDashboard>>["cars"][number];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const saveCar = useServerFn(updateDealerCar);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const headers = await getSupabaseAuthHeaders();
      const statusBadge = pipeline.find(
        (stage) => stage.status === form.get("statusBadge"),
      )?.status;
      if (!statusBadge) throw new Error("Choose a valid inventory status.");
      await saveCar({
        data: {
          carId: vehicle.id,
          brand: String(form.get("brand")),
          model: String(form.get("model")),
          year: Number(form.get("year")),
          sellingPrice: Number(form.get("sellingPrice")),
          chassisNumber: String(form.get("chassisNumber") || "") || null,
          statusBadge,
        },
        headers,
      });
      toast.success("Vehicle details updated.");
      onSaved();
    } catch (error) {
      console.error("Could not update vehicle details", error);
      toast.error(
        error instanceof Error ? error.message : "Could not update vehicle.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit vehicle details</DialogTitle>
          <DialogDescription>
            Update the listing details for {vehicle.year} {vehicle.brand}{" "}
            {vehicle.model}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              Brand
              <input
                name="brand"
                defaultValue={vehicle.brand}
                required
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Model
              <input
                name="model"
                defaultValue={vehicle.model}
                required
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Year
              <input
                name="year"
                type="number"
                min="1900"
                max="2100"
                defaultValue={vehicle.year}
                required
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Selling price (KSh)
              <input
                name="sellingPrice"
                type="number"
                min="1"
                defaultValue={vehicle.selling_price}
                required
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
              Chassis number
              <input
                name="chassisNumber"
                defaultValue={vehicle.chassis_number ?? ""}
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
              Inventory status
              <select
                name="statusBadge"
                defaultValue={vehicle.status_badge}
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              >
                {pipeline.map((stage) => (
                  <option key={stage.status} value={stage.status}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
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
  const activeBrokers = dashboard.staff.filter(
    (worker) => worker.workspace_role === "BROKER" && worker.is_active,
  );

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    try {
      const headers = await getSupabaseAuthHeaders();
      const result = await saveSale({
        data: {
          carId: String(form.get("carId")),
          brokerWorkerId: String(form.get("brokerWorkerId") ?? "") || null,
          finalSalePrice: Number(form.get("finalSalePrice")),
        },
        headers,
      });
      toast.success(
        `Completed sale recorded. Broker commission: ${formatKsh(result.commissionAmountKsh)}.`,
      );
      formElement.reset();
      onSaved();
    } catch (error) {
      console.error("Could not record completed vehicle sale", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not record completed vehicle sale.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(event) => void submitSale(event)}
        className="max-w-3xl rounded-2xl border bg-card p-5 shadow-sm"
      >
        <h2 className="text-xl font-semibold">Record a completed sale</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The database snapshots the vehicle&apos;s configured commission rate
          and calculates commission from the final sale price.
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
            Broker
            <select
              name="brokerWorkerId"
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
            >
              <option value="">No broker attribution</option>
              {activeBrokers.map((worker) => (
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
                  <td className="px-3 py-4">
                    {formatKsh(Number(sale.final_sale_price))}
                  </td>
                  <td className="px-3 py-4">{sale.broker_name ?? "—"}</td>
                  <td className="px-3 py-4">
                    {Number(sale.commission_rate_percent)}%
                  </td>
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
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
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
          detail={
            liveLogs ? "Live immutable records" : "Load live data to view"
          }
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Fleet pipeline</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {liveCars
              ? "Live vehicle counts by import stage"
              : "Load live data to view this yard's fleet"}
          </p>
          <div className="mt-4 space-y-3">
            {statuses.map((status) => {
              const count =
                liveCars?.filter((car) => car.status_badge === status.key)
                  .length ?? 0;
              return (
                <div
                  key={status.key}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <span>{status.label}</span>
                  <span className="font-semibold">
                    {liveCars ? count : "—"}
                  </span>
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
        {logs ? (
          logs.map((log) => (
            <article key={log.id} className="rounded-xl border p-3">
              <div className="flex flex-wrap justify-between gap-1 text-xs text-muted-foreground">
                <span>{new Date(log.timestamp).toLocaleString("en-KE")}</span>
                <span>{log.worker_email}</span>
              </div>
              <p className="mt-2 text-sm font-medium">{log.action_performed}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                Record: {log.record_id}
              </p>
            </article>
          ))
        ) : (
          <p className="py-3 text-sm text-muted-foreground">
            Load live audit records to view this yard's activity.
          </p>
        )}
        {logs?.length === 0 && (
          <p className="py-3 text-sm text-muted-foreground">
            No audit entries recorded for this yard.
          </p>
        )}
      </div>
    </section>
  );
}

function StaffTable({
  liveStaff,
  loading,
  canManageStaff,
  creatingWorker,
  onCreateWorker,
  onLoadLiveData,
  onDeactivateLiveWorker,
}: {
  liveStaff: Awaited<ReturnType<typeof getDealerDashboard>>["staff"] | null;
  loading: boolean;
  canManageStaff: boolean;
  creatingWorker: boolean;
  onCreateWorker: (event: FormEvent<HTMLFormElement>) => void;
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
            ? "The owner controls staff access and creates broker and salesperson accounts."
            : "Load live staff records to manage this yard's worker access."}
        </p>
      </div>
      <button
        type="button"
        onClick={onLoadLiveData}
        disabled={loading}
        className="mb-4 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {loading
          ? "Loading…"
          : liveStaff
            ? "Refresh live staff"
            : "Load live staff"}
      </button>
      {canManageStaff && liveStaff && (
        <form
          onSubmit={onCreateWorker}
          className="mb-5 grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
        >
          <label className="space-y-1.5 text-sm font-medium">
            Staff full name
            <input
              name="workerName"
              required
              minLength={2}
              maxLength={160}
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Staff sign-in email
            <input
              name="workerEmail"
              type="email"
              required
              maxLength={254}
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Role
            <select
              name="workspaceRole"
              required
              className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
            >
              <option value="SALESPERSON">Salesperson</option>
              <option value="BROKER">Broker</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={creatingWorker}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {creatingWorker ? "Adding…" : "Add staff account"}
          </button>
        </form>
      )}
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
                  <td className="px-3 py-4">
                    {staff.role === "YARD_MANAGER"
                      ? "Yard manager"
                      : staff.role === "SALESPERSON"
                        ? "Salesperson"
                        : staff.role === "BROKER"
                          ? "Broker"
                          : "Owner"}
                  </td>
                  <td className="px-3 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${inactive ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}
                    >
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
                      {inactive ? "Deactivated" : "Deactivate Account"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {liveStaff?.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-sm text-muted-foreground"
                >
                  No workers are registered for this yard.
                </td>
              </tr>
            )}
            {liveStaff === null && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-sm text-muted-foreground"
                >
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
  const createImageUploads = useServerFn(createVehicleImageUploadUrls);
  const deleteImageUploads = useServerFn(deleteVehicleImageUploads);
  const [busy, setBusy] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [costs, setCosts] = useState({
    cif: 0,
    duty: 0,
    port: 0,
    transport: 0,
  });
  const [tradeTerms, setTradeTerms] = useState({
    wholesalePrice: "",
    commissionRate: "",
  });
  const total = costs.cif + costs.duty + costs.port + costs.transport;

  function updateCost(key: keyof typeof costs, value: string) {
    setCosts((current) => ({ ...current, [key]: Number(value) || 0 }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    let uploadPaths: string[] = [];
    try {
      const headers = await getSupabaseAuthHeaders();
      let images: string[] = [];
      if (imageFiles.length > 0) {
        const { uploads } = await createImageUploads({
          data: {
            files: imageFiles.map((file) => {
              if (!isVehicleImageContentType(file.type))
                throw new Error(
                  `${file.name} must be a JPEG, PNG, or WebP image.`,
                );
              return { contentType: file.type, size: file.size };
            }),
          },
          headers,
        });
        uploadPaths = uploads.map((upload) => upload.path);
        images = await Promise.all(
          uploads.map(async (upload, index) => {
            const file = imageFiles[index];
            if (!file)
              throw new Error("Vehicle image selection changed during upload.");
            const { error } = await supabase.storage
              .from("vehicle-images")
              .uploadToSignedUrl(upload.path, upload.token, file, {
                contentType: file.type,
                upsert: false,
              });
            if (error)
              throw new Error(
                `Could not upload ${file.name}: ${error.message}`,
              );
            return upload.publicUrl;
          }),
        );
      }

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
          images,
        },
        headers,
      });
      uploadPaths = [];
      formElement.reset();
      setImageFiles([]);
      toast.success(
        `Vehicle saved. Total true cost: ${formatKsh(result.totalTrueCostKsh)}.`,
      );
      onOpenChange(false);
      onSaved();
    } catch (error) {
      if (uploadPaths.length > 0) {
        try {
          const headers = await getSupabaseAuthHeaders();
          await deleteImageUploads({ data: { paths: uploadPaths }, headers });
        } catch (cleanupError) {
          console.error(
            "Could not clean up vehicle image uploads",
            cleanupError,
          );
          toast.error(
            "The vehicle could not be saved, and some uploaded images may need cleanup.",
          );
        }
      }
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

  function addImageFiles(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    const invalidFile = selected.find(
      (file) =>
        !isVehicleImageContentType(file.type) || file.size > 10 * 1024 * 1024,
    );
    if (invalidFile) {
      toast.error(
        `${invalidFile.name} must be a JPEG, PNG, or WebP image no larger than 10 MB.`,
      );
      return;
    }
    if (imageFiles.length + selected.length > 12) {
      toast.error("Add up to 12 vehicle images.");
      return;
    }
    setImageFiles((current) => [...current, ...selected]);
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
            Add up to 12 vehicle images. Costs total automatically, and the
            vehicle is saved to your assigned yard.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              Brand
              <input
                name="brand"
                required
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Model
              <input
                name="model"
                required
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Year
              <input
                name="year"
                type="number"
                min="1900"
                max="2100"
                required
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Selling price (KSh)
              <input
                name="sellingPrice"
                type="number"
                min="1"
                required
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              />
            </label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">
              Chassis number
              <input
                name="chassisNumber"
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal"
              />
            </label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">
              Vehicle images
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => {
                  addImageFiles(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
                className="block w-full rounded-lg border bg-background px-3 py-2 font-normal file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
              <span className="block text-xs font-normal text-muted-foreground">
                JPEG, PNG, or WebP · up to 10 MB each · maximum 12 images
              </span>
            </label>
            {imageFiles.length > 0 && (
              <ul className="space-y-2 sm:col-span-2">
                {imageFiles.map((file, index) => (
                  <li
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setImageFiles((current) =>
                          current.filter((_, fileIndex) => fileIndex !== index),
                        )
                      }
                      className="shrink-0 text-xs font-semibold text-destructive"
                      aria-label={`Remove ${file.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
            <p className="text-sm font-medium text-muted-foreground">
              Total True Cost
            </p>
            <p className="mt-1 text-2xl font-bold text-primary">
              {formatKsh(total)}
            </p>
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
