import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransactionSql } from "postgres";
import { z } from "zod";
import { requireRailwaySystemActiveMiddleware } from "@/integrations/railway-middleware";
import { requireSupabaseAuth } from "@/integrations/auth-middleware";
import type { Database } from "@/integrations/types";
import { withRailwayTransaction } from "./railway.server";

const uuid = z.string().uuid();
const money = z.number().int().safe().nonnegative();

const createCarSchema = z.object({
  dealerId: uuid,
  brand: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  chassisNumber: z.string().trim().min(1).max(100).nullable().optional(),
  sellingPrice: money.positive(),
  statusBadge: z.enum(["PURCHASED", "ON_OCEAN", "PORT_CLEARING", "IN_YARD"]),
  year: z.number().int().min(1900).max(2100),
  mileageKm: z.number().int().nonnegative(),
  engineCc: z.number().int().positive().nullable().optional(),
  transmission: z.string().trim().min(1).max(40),
  fuel: z.string().trim().min(1).max(40),
  color: z.string().trim().max(60).nullable().optional(),
  bodyType: z.string().trim().max(60).nullable().optional(),
  drive: z.string().trim().max(60).nullable().optional(),
  bookingDepositKsh: money,
  etaDate: z.string().date().nullable().optional(),
  images: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
  description: z.string().trim().max(2000).nullable().optional(),
  cifPurchasePrice: money,
  kraImportDuty: money,
  portClearanceFees: money,
  flatbedTransport: money,
});

type AuthContext = {
  userId: string;
  claims: { email?: unknown };
  supabase: SupabaseClient<Database>;
};

function principal(context: { userId: string; claims: { email?: unknown } }) {
  return {
    userId: uuid.parse(context.userId),
    workerEmail:
      typeof context.claims.email === "string"
        ? context.claims.email
        : "unknown",
  };
}

async function assertSuperAdmin(context: AuthContext): Promise<void> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error)
    throw new Error(`Could not verify super-admin role: ${error.message}`);
  if (!data) throw new Error("Unauthorized: super-admin access required.");
}

async function assertDealerWorker(
  transaction: TransactionSql,
  dealerId: string,
  userId: string,
  allowedRoles: readonly ("OWNER" | "YARD_MANAGER" | "SALESPERSON")[],
) {
  const rows = await transaction`
    select w.id, w.auth_user_id, w.email, w.workspace_role
    from workers w
    join dealers d on d.id = w.dealer_id
    where w.dealer_id = ${dealerId}
      and w.auth_user_id = ${userId}
      and w.is_active
      and d.subscription_status = 'ACTIVE'
      and d.subscription_expires_at > now()
      and (
        (${allowedRoles.includes("OWNER")} and w.workspace_role = 'OWNER')
        or (${allowedRoles.includes("YARD_MANAGER")} and w.workspace_role = 'YARD_MANAGER')
        or (${allowedRoles.includes("SALESPERSON")} and w.workspace_role = 'SALESPERSON')
      )
    limit 1
  `;
  if (!rows[0])
    throw new Error("Unauthorized: active dealer membership required.");
  return rows[0] as {
    id: string;
    auth_user_id: string;
    email: string;
    workspace_role: "OWNER" | "YARD_MANAGER" | "SALESPERSON";
  };
}

export const createCarWithImportCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRailwaySystemActiveMiddleware])
  .inputValidator((input: z.input<typeof createCarSchema>) =>
    createCarSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = principal(context);
    return withRailwayTransaction(actor, async (transaction) => {
      const worker = await assertDealerWorker(
        transaction,
        data.dealerId,
        actor.userId,
        ["OWNER", "YARD_MANAGER"],
      );
      const [dealer] = await transaction<{ active: boolean }[]>`
        select subscription_status = 'ACTIVE' and subscription_expires_at > now() as active
        from dealers where id = ${data.dealerId}
      `;
      if (!dealer?.active)
        throw new Error("Dealer subscription is expired or inactive.");

      const [car] = await transaction<{ id: string }[]>`
        insert into cars (
          dealer_id, brand, model, chassis_number, selling_price, status_badge,
          year, mileage_km, engine_cc, transmission, fuel, color, body_type, drive,
          booking_deposit_ksh, eta_date, images, description
        ) values (
          ${data.dealerId}, ${data.brand}, ${data.model}, ${data.chassisNumber ?? null},
          ${data.sellingPrice}, ${data.statusBadge}, ${data.year}, ${data.mileageKm},
          ${data.engineCc ?? null}, ${data.transmission}, ${data.fuel},
          ${data.color ?? null}, ${data.bodyType ?? null}, ${data.drive ?? null},
          ${data.bookingDepositKsh}, ${data.etaDate ?? null}, ${data.images},
          ${data.description ?? null}
        )
        returning id
      `;
      if (!car) throw new Error("Could not save vehicle.");

      const [cost] = await transaction<{ total_true_cost: string | number }[]>`
        insert into import_costs (
          car_id, dealer_id, cif_purchase_price, kra_import_duty, port_clearance_fees, flatbed_transport
        ) values (
          ${car.id}, ${data.dealerId}, ${data.cifPurchasePrice}, ${data.kraImportDuty},
          ${data.portClearanceFees}, ${data.flatbedTransport}
        )
        returning total_true_cost
      `;
      if (!cost) throw new Error("Could not save vehicle import costs.");
      const totalTrueCostKsh = Number(cost.total_true_cost);
      if (!Number.isSafeInteger(totalTrueCostKsh))
        throw new Error(
          "Calculated import cost is outside the safe KSh range.",
        );

      return {
        carId: car.id,
        totalTrueCostKsh,
        createdBy: worker.email,
      };
    });
  });

const deactivateWorkerSchema = z.object({ dealerId: uuid, workerId: uuid });

export const deactivateDealerWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRailwaySystemActiveMiddleware])
  .inputValidator((input: z.input<typeof deactivateWorkerSchema>) =>
    deactivateWorkerSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = principal(context);
    return withRailwayTransaction(actor, async (transaction) => {
      await assertDealerWorker(transaction, data.dealerId, actor.userId, [
        "OWNER",
      ]);

      const [target] = await transaction<
        { workspace_role: string; auth_user_id: string | null }[]
      >`
        select workspace_role, auth_user_id
        from workers where id = ${data.workerId} and dealer_id = ${data.dealerId}
        for update
      `;
      if (!target) throw new Error("Worker not found in this dealer.");
      if (
        target.workspace_role === "OWNER" ||
        target.auth_user_id === actor.userId
      ) {
        throw new Error(
          "Owners cannot deactivate themselves or another owner.",
        );
      }

      const [worker] = await transaction<{ id: string }[]>`
        update workers set is_active = false
        where id = ${data.workerId} and dealer_id = ${data.dealerId}
        returning id
      `;
      if (!worker) throw new Error("Worker deactivation failed.");
      return { workerId: worker.id, isActive: false };
    });
  });

const setSystemActiveSchema = z.object({ active: z.boolean() });

export const setRailwaySystemActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof setSystemActiveSchema>) =>
    setSystemActiveSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const actor = principal(context);
    return withRailwayTransaction(
      { ...actor, superAdmin: true, allowMaintenance: true },
      async (transaction) => {
        const [settings] = await transaction<{ is_system_active: boolean }[]>`
        update global_settings
        set is_system_active = ${data.active}, updated_at = now()
        where id = 1
        returning is_system_active
      `;
        if (!settings)
          throw new Error("Global system settings have not been initialized.");
        return { active: settings.is_system_active };
      },
    );
  });

const subscriptionPaymentSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("stripe"),
    eventId: z.string().trim().min(1).max(200),
    dealerId: uuid,
    amountKsh: money.positive(),
    paidAt: z.string().datetime(),
    subscriptionExpiresAt: z.string().datetime(),
    providerReference: z.string().trim().min(1).max(200),
  }),
  z.object({
    provider: z.literal("mpesa"),
    eventId: z.string().trim().min(1).max(200),
    dealerId: uuid,
    amountKsh: money.positive(),
    paidAt: z.string().datetime(),
    subscriptionExpiresAt: z.string().datetime(),
    providerReference: z.string().trim().min(1).max(200),
  }),
]);

export const recordSubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRailwaySystemActiveMiddleware])
  .inputValidator((input: z.input<typeof subscriptionPaymentSchema>) =>
    subscriptionPaymentSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const actor = principal(context);
    return withRailwayTransaction(
      { ...actor, superAdmin: true },
      async (transaction) => {
        const events = await transaction<{ id: string }[]>`
        insert into subscription_events (
          provider, provider_event_id, dealer_id, amount_ksh, paid_at,
          subscription_expires_at, provider_reference
        ) values (
          ${data.provider}, ${data.eventId}, ${data.dealerId}, ${data.amountKsh},
          ${data.paidAt}, ${data.subscriptionExpiresAt}, ${data.providerReference}
        )
        on conflict (provider, provider_event_id) do nothing
        returning id
      `;
        if (!events[0]) return { recorded: false, duplicate: true };

        const [dealer] = await transaction<{ id: string }[]>`
        update dealers
        set subscription_expires_at = greatest(subscription_expires_at, ${data.subscriptionExpiresAt}::timestamptz),
            subscription_status = case
              when greatest(subscription_expires_at, ${data.subscriptionExpiresAt}::timestamptz) > now()
                then 'ACTIVE'::subscription_status
              else 'EXPIRED'::subscription_status
            end
        where id = ${data.dealerId}
        returning id
      `;
        if (!dealer)
          throw new Error("Dealer not found for subscription payment.");
        return { recorded: true, duplicate: false };
      },
    );
  });
