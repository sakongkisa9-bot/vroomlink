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
  dealerId: uuid.optional(),
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
  brokerWholesalePrice: money,
  brokerCommissionRatePercent: z.number().min(0).max(100),
});

const submitBrokerLeadSchema = z.object({
  carId: uuid,
  customerName: z.string().trim().min(1).max(160),
  customerPhone: z
    .string()
    .trim()
    .min(7)
    .max(24)
    .regex(/^[+()\d\s-]+$/),
});

const recordVehicleSaleSchema = z.object({
  carId: uuid,
  brokerWorkerId: uuid.nullable(),
  finalSalePrice: money.positive(),
});

type AuthContext = {
  userId: string;
  claims: { email?: unknown };
  supabase: SupabaseClient<Database>;
  accessToken: string;
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

async function resolveCurrentDealerId(
  transaction: TransactionSql,
  userId: string,
  requestedDealerId?: string,
  allowedRoles: readonly ("OWNER" | "YARD_MANAGER" | "SALESPERSON")[] = [],
): Promise<string> {
  if (requestedDealerId) return requestedDealerId;

  const [membership] = await transaction<{ dealer_id: string }[]>`
    select w.dealer_id
    from workers w
    join dealers d on d.id = w.dealer_id
    where w.auth_user_id = ${userId}
      and w.is_active
      and d.subscription_status = 'ACTIVE'
      and d.subscription_expires_at > now()
      and (
        (${allowedRoles.includes("OWNER")} and w.workspace_role = 'OWNER')
        or (${allowedRoles.includes("YARD_MANAGER")} and w.workspace_role = 'YARD_MANAGER')
        or (${allowedRoles.includes("SALESPERSON")} and w.workspace_role = 'SALESPERSON')
      )
    order by w.created_at asc
    limit 1
  `;
  if (!membership)
    throw new Error("No active yard worker account is linked to this Supabase user.");
  return membership.dealer_id;
}

export const createCarWithImportCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRailwaySystemActiveMiddleware])
  .inputValidator((input: z.input<typeof createCarSchema>) =>
    createCarSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = principal(context);
    return withRailwayTransaction(actor, async (transaction) => {
      const dealerId = await resolveCurrentDealerId(
        transaction,
        actor.userId,
        data.dealerId,
        ["OWNER", "YARD_MANAGER"],
      );
      const worker = await assertDealerWorker(
        transaction,
        dealerId,
        actor.userId,
        ["OWNER", "YARD_MANAGER"],
      );
      const [dealer] = await transaction<{ active: boolean }[]>`
        select subscription_status = 'ACTIVE' and subscription_expires_at > now() as active
        from dealers where id = ${dealerId}
      `;
      if (!dealer?.active)
        throw new Error("Dealer subscription is expired or inactive.");

      const [car] = await transaction<{ id: string }[]>`
        insert into cars (
          dealer_id, brand, model, chassis_number, selling_price, status_badge,
          year, mileage_km, engine_cc, transmission, fuel, color, body_type, drive,
          booking_deposit_ksh, eta_date, images, description
        ) values (
          ${dealerId}, ${data.brand}, ${data.model}, ${data.chassisNumber ?? null},
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
          ${car.id}, ${dealerId}, ${data.cifPurchasePrice}, ${data.kraImportDuty},
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

      await transaction`
        insert into vehicle_trade_pricing (
          car_id, yard_id, wholesale_price, broker_commission_rate_percent
        ) values (
          ${car.id}, ${dealerId}, ${data.brokerWholesalePrice},
          ${data.brokerCommissionRatePercent}
        )
      `;

      return {
        carId: car.id,
        totalTrueCostKsh,
        createdBy: worker.email,
      };
    });
  });

export const getBrokerDashboard = createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth, requireRailwaySystemActiveMiddleware])
    .handler(async ({ context }) => {
      const actor = principal(context);
      return withRailwayTransaction(actor, async (transaction) => {
        const dealerId = await resolveCurrentDealerId(
          transaction,
          actor.userId,
          undefined,
          ["SALESPERSON"],
        );
        const worker = await assertDealerWorker(transaction, dealerId, actor.userId, [
          "SALESPERSON",
        ]);

        const cars = await transaction<{
          id: string;
          brand: string;
          model: string;
          year: number;
          selling_price: string;
          status_badge: "PURCHASED" | "ON_OCEAN" | "PORT_CLEARING" | "IN_YARD";
          wholesale_price: string;
          broker_commission_rate_percent: string;
        }[]>`
          select c.id, c.brand, c.model, c.year, c.selling_price::text,
            c.status_badge, tp.wholesale_price::text,
            tp.broker_commission_rate_percent::text
          from cars c
          join vehicle_trade_pricing tp on tp.car_id = c.id and tp.yard_id = c.dealer_id
          where c.dealer_id = ${dealerId}
            and c.is_published
            and not exists (
              select 1 from vehicle_sales vs where vs.car_id = c.id
            )
          order by c.created_at desc
          limit 100
        `;

        const leads = await transaction<{
          id: string;
          car_id: string;
          customer_name: string;
          customer_phone: string;
          status: "NEW" | "CONTACTED" | "CONVERTED" | "LOST";
          created_at: string;
          brand: string;
          model: string;
          year: number;
        }[]>`
          select l.id, l.car_id, l.customer_name, l.customer_phone, l.status,
            l.created_at::text, c.brand, c.model, c.year
          from broker_leads l
          join cars c on c.id = l.car_id
          where l.salesperson_worker_id = ${worker.id}
          order by l.created_at desc
          limit 100
        `;

        const commissions = await transaction<{
          id: string;
          final_sale_price: string;
          commission_rate_percent: string;
          commission_amount: string;
          sold_at: string;
          brand: string;
          model: string;
          year: number;
        }[]>`
          select vs.id, vs.final_sale_price::text, vs.commission_rate_percent::text,
            vs.commission_amount::text, vs.sold_at::text, c.brand, c.model, c.year
          from vehicle_sales vs
          join cars c on c.id = vs.car_id
          where vs.broker_worker_id = ${worker.id}
          order by vs.sold_at desc
          limit 100
        `;

        const [activeLeadCount] = await transaction<{ count: string }[]>`
          select count(*)::text as count
          from broker_leads
          where salesperson_worker_id = ${worker.id}
            and status in ('NEW', 'CONTACTED')
        `;
        if (!activeLeadCount)
          throw new Error("Could not calculate active broker leads.");

        const [earned] = await transaction<{ commission_earned: string }[]>`
          select coalesce(sum(commission_amount), 0)::text as commission_earned
          from vehicle_sales
          where broker_worker_id = ${worker.id}
        `;
        if (!earned) throw new Error("Could not calculate broker commissions.");

        return {
          brokerWorkerId: worker.id,
          dealerId,
          cars,
          leads,
          commissions,
          commissionEarnedKsh: earned.commission_earned,
          activeLeadCount: Number(activeLeadCount.count),
        };
      });
    });

export const submitBrokerLead = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth, requireRailwaySystemActiveMiddleware])
    .inputValidator((input: z.input<typeof submitBrokerLeadSchema>) =>
      submitBrokerLeadSchema.parse(input),
    )
    .handler(async ({ data, context }) => {
      const actor = principal(context);
      return withRailwayTransaction(actor, async (transaction) => {
        const dealerId = await resolveCurrentDealerId(
          transaction,
          actor.userId,
          undefined,
          ["SALESPERSON"],
        );
        const worker = await assertDealerWorker(transaction, dealerId, actor.userId, [
          "SALESPERSON",
        ]);
        const [lead] = await transaction<{ id: string }[]>`
          insert into broker_leads (
            yard_id, car_id, salesperson_worker_id, customer_name, customer_phone
          )
          select c.dealer_id, c.id, ${worker.id}, ${data.customerName},
            ${data.customerPhone}
          from cars c
          join vehicle_trade_pricing tp
            on tp.car_id = c.id and tp.yard_id = c.dealer_id
          where c.id = ${data.carId}
            and c.dealer_id = ${dealerId}
            and c.is_published
            and not exists (
              select 1 from vehicle_sales vs where vs.car_id = c.id
            )
          returning id
        `;
        if (!lead)
          throw new Error("Vehicle not found, not broker-enabled, or no longer available.");
        return { leadId: lead.id };
      });
    });

export const recordCompletedVehicleSale = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth, requireRailwaySystemActiveMiddleware])
    .inputValidator((input: z.input<typeof recordVehicleSaleSchema>) =>
      recordVehicleSaleSchema.parse(input),
    )
    .handler(async ({ data, context }) => {
      const actor = principal(context);
      return withRailwayTransaction(actor, async (transaction) => {
        const dealerId = await resolveCurrentDealerId(
          transaction,
          actor.userId,
          undefined,
          ["OWNER", "YARD_MANAGER"],
        );
        const worker = await assertDealerWorker(transaction, dealerId, actor.userId, [
          "OWNER",
          "YARD_MANAGER",
        ]);
        const [sale] = await transaction<{
          id: string;
          commission_amount: string;
          commission_rate_percent: string;
        }[]>`
          insert into vehicle_sales (
            yard_id, car_id, broker_worker_id, recorded_by_worker_id, final_sale_price
          )
          select c.dealer_id, c.id, ${data.brokerWorkerId}, ${worker.id},
            ${data.finalSalePrice}
          from cars c
          where c.id = ${data.carId}
            and c.dealer_id = ${dealerId}
            and not exists (
              select 1 from vehicle_sales existing where existing.car_id = c.id
            )
          returning id, commission_amount::text, commission_rate_percent::text
        `;
        if (!sale)
          throw new Error("Vehicle not found or a completed sale is already recorded.");

        const [car] = await transaction<{ id: string }[]>`
          update cars
          set is_published = false, updated_at = now()
          where id = ${data.carId} and dealer_id = ${dealerId}
          returning id
        `;
        if (!car) throw new Error("Could not mark the sold vehicle unavailable.");

        return {
          saleId: sale.id,
          commissionAmountKsh: Number(sale.commission_amount),
          commissionRatePercent: Number(sale.commission_rate_percent),
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

const dealerDashboardSchema = z.object({ dealerId: uuid.optional() });

export const getDealerDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireRailwaySystemActiveMiddleware])
  .inputValidator((input: z.input<typeof dealerDashboardSchema>) =>
  dealerDashboardSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
  const actor = principal(context);
  return withRailwayTransaction(actor, async (transaction) => {
    const dealerId = await resolveCurrentDealerId(
      transaction,
      actor.userId,
      data.dealerId,
      ["OWNER", "YARD_MANAGER"],
    );
    const worker = await assertDealerWorker(transaction, dealerId, actor.userId, [
      "OWNER",
      "YARD_MANAGER",
    ]);

    const cars = await transaction<{
      id: string;
      brand: string;
      model: string;
      year: number;
      selling_price: string;
      status_badge: "PURCHASED" | "ON_OCEAN" | "PORT_CLEARING" | "IN_YARD";
      chassis_number: string | null;
    }[]>`
      select id, brand, model, year, selling_price::text, status_badge, chassis_number
      from cars
      where dealer_id = ${dealerId}
        and not exists (
          select 1 from vehicle_sales vs where vs.car_id = cars.id
        )
      order by created_at desc
      limit 100
    `;

    const staff = await transaction<{
      id: string;
      full_name: string;
      email: string;
      workspace_role: "OWNER" | "YARD_MANAGER" | "SALESPERSON";
      is_active: boolean;
    }[]>`
      select id, full_name, email, workspace_role, is_active
      from workers
      where dealer_id = ${dealerId}
      order by created_at asc
    `;

    const logs = await transaction<{
      id: string;
      worker_email: string;
      action_performed: string;
      record_id: string;
      timestamp: string;
    }[]>`
      select id, worker_email, action_performed, record_id, "timestamp"::text
      from system_logs
      where dealer_id = ${dealerId}
      order by "timestamp" desc
      limit 50
    `;

    const sales = await transaction<{
      id: string;
      final_sale_price: string;
      commission_rate_percent: string;
      commission_amount: string;
      sold_at: string;
      brand: string;
      model: string;
      year: number;
      broker_name: string | null;
      broker_email: string | null;
    }[]>`
      select vs.id, vs.final_sale_price::text, vs.commission_rate_percent::text,
        vs.commission_amount::text, vs.sold_at::text, c.brand, c.model, c.year,
        w.full_name as broker_name, w.email as broker_email
      from vehicle_sales vs
      join cars c on c.id = vs.car_id
      left join workers w on w.id = vs.broker_worker_id
      where vs.yard_id = ${dealerId}
      order by vs.sold_at desc
      limit 100
    `;

    return { dealerId, currentRole: worker.workspace_role, cars, staff, logs, sales };
  });
  });

export const linkAuthenticatedWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRailwaySystemActiveMiddleware])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.auth.getUser(context.accessToken);
    if (error) {
      throw new Error(`Could not verify the authenticated Supabase user: ${error.message}`);
    }
    if (!data.user?.email || !data.user.email_confirmed_at) {
      throw new Error("Verify your Supabase email before linking a yard worker account.");
    }

    const actor = {
      userId: uuid.parse(context.userId),
      workerEmail: data.user.email,
    };
    return withRailwayTransaction(actor, async (transaction) => {
      const [result] = await transaction<{ linked_count: number }[]>`
        select link_authenticated_worker_identity() as linked_count
      `;
      if (!result) throw new Error("Worker identity linking returned no result.");
      return { linkedWorkers: Number(result.linked_count) };
    });
  });

export const getDeveloperDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
  await assertSuperAdmin(context);
  const actor = principal(context);
  return withRailwayTransaction(
    { ...actor, superAdmin: true, allowMaintenance: true },
    async (transaction) => {
      const dealers = await transaction<{
        id: string;
        showroom_name: string;
        location: string;
        subscription_status: "ACTIVE" | "EXPIRED";
        subscription_expires_at: string;
      }[]>`
        select id, showroom_name, location, subscription_status, subscription_expires_at::text
        from dealers
        order by subscription_expires_at desc
        limit 100
      `;

      const payments = await transaction<{
        provider: "stripe" | "mpesa";
        amount_ksh: string;
        paid_at: string;
      }[]>`
        select provider, amount_ksh::text, paid_at::text
        from subscription_events
        where paid_at >= date_trunc('month', now())
        order by paid_at desc
        limit 200
      `;

      return { dealers, payments };
    },
  );
  });
