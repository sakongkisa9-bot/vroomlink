import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { TransactionSql } from "postgres";
import { z } from "zod";
import { requireRailwaySystemActiveMiddleware } from "@/integrations/railway-middleware";
import { requireRailwayAuth, requireRailwayAuthAllowingTemporaryPassword } from "@/integrations/railway-auth-middleware";
import { getRailwayAuth } from "@/integrations/railway-auth.server";
import { getRailwayClient, withRailwayTransaction } from "./railway.server";

const uuid = z.string().uuid();
const money = z.number().int().safe().nonnegative();
type WorkspaceRole = "OWNER" | "YARD_MANAGER" | "SALESPERSON" | "BROKER";

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
  sourceCountry: z.string().trim().max(80).nullable().optional(),
  sourceSeller: z.string().trim().max(160).nullable().optional(),
  titleStatus: z.string().trim().max(80).nullable().optional(),
  logbookNumber: z.string().trim().max(100).nullable().optional(),
  importEntryNumber: z.string().trim().max(100).nullable().optional(),
  conditionGrade: z.string().trim().max(40).nullable().optional(),
  accidentHistory: z.string().trim().max(1000).nullable().optional(),
  serviceHistory: z.string().trim().max(1000).nullable().optional(),
  inspectionNotes: z.string().trim().max(2000).nullable().optional(),
  cifPurchasePrice: money,
  kraImportDuty: money,
  portClearanceFees: money,
  flatbedTransport: money,
  brokerWholesalePrice: money,
  brokerCommissionRatePercent: z.number().min(0).max(100),
});
const updateCarSchema = z.object({
  carId: uuid,
  brand: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  chassisNumber: z.string().trim().min(1).max(100).nullable(),
  sellingPrice: money.positive(),
  statusBadge: z.enum(["PURCHASED", "ON_OCEAN", "PORT_CLEARING", "IN_YARD"]),
  year: z.number().int().min(1900).max(2100),
  mileageKm: z.number().int().nonnegative(),
  engineCc: z.number().int().positive().nullable(),
  transmission: z.string().trim().min(1).max(40),
  fuel: z.string().trim().min(1).max(40),
  color: z.string().trim().max(60).nullable(),
  bodyType: z.string().trim().max(60).nullable(),
  drive: z.string().trim().max(60).nullable(),
  bookingDepositKsh: money,
  etaDate: z.string().date().nullable(),
  images: z.array(z.string().trim().min(1).max(500)).max(12),
  description: z.string().trim().max(2000).nullable(),
  cifPurchasePrice: money,
  kraImportDuty: money,
  portClearanceFees: money,
  flatbedTransport: money,
  brokerWholesalePrice: money,
  brokerCommissionRatePercent: z.number().min(0).max(100),
  sourceCountry: z.string().trim().max(80).nullable(),
  sourceSeller: z.string().trim().max(160).nullable(),
  titleStatus: z.string().trim().max(80).nullable(),
  logbookNumber: z.string().trim().max(100).nullable(),
  importEntryNumber: z.string().trim().max(100).nullable(),
  conditionGrade: z.string().trim().max(40).nullable(),
  accidentHistory: z.string().trim().max(1000).nullable(),
  serviceHistory: z.string().trim().max(1000).nullable(),
  inspectionNotes: z.string().trim().max(2000).nullable(),
});
const deleteVehicleImageUploadsSchema = z.object({
  imageIds: z.array(uuid).max(12),
});
const setAccountPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128),
});
const temporaryPassword = z.string().min(8).max(128);
const changeTemporaryPasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: temporaryPassword,
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

const createDealerSchema = z.object({
  showroomName: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens for the yard slug.",
    ),
  whatsappPhone: z
    .string()
    .trim()
    .min(7)
    .max(24)
    .regex(/^[+()\d\s-]+$/, "Enter a valid contact number."),
  ownerName: z.string().trim().min(2).max(160),
  ownerEmail: z.string().trim().email().max(254),
  ownerTemporaryPassword: temporaryPassword.nullable().optional(),
  subscriptionExpiresAt: z
    .string()
    .datetime()
    .refine((value) => new Date(value).getTime() > Date.now(), {
      message: "Subscription expiry must be in the future.",
    }),
});

type AuthContext = {
  userId: string;
  claims: { email?: unknown };
  emailVerified: boolean;
};

// Returns null when the email already has a login, so an owner can never overwrite someone else's account.
async function provisionTemporaryLogin(input: {
  email: string;
  fullName: string;
  password: string;
}): Promise<string | null> {
  const { internalAdapter, password } = await getRailwayAuth().$context;
  const email = input.email.trim().toLowerCase();
  if (await internalAdapter.findUserByEmail(email)) return null;

  const user = await internalAdapter.createUser(
    {
      email,
      name: input.fullName,
      emailVerified: false,
      mustChangePassword: true,
    },
    { method: "admin" },
  );
  await internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await password.hash(input.password),
  });
  return user.id;
}

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
  const email =
    typeof context.claims.email === "string"
      ? context.claims.email.trim().toLowerCase()
      : "";
  if (!context.emailVerified || !email)
    throw new Error("Unauthorized: super-admin access required.");

  const [admin] = await getRailwayClient()`
    select 1 as ok from platform_admins where email = ${email}
  `;
  if (!admin) throw new Error("Unauthorized: super-admin access required.");
}

async function assertDealerWorker(
  transaction: TransactionSql,
  dealerId: string,
  userId: string,
  allowedRoles: readonly WorkspaceRole[],
) {
  const rows = await transaction`
    select w.id, w.auth_user_id, w.email, w.workspace_role
    from workers w
    join dealers d on d.id = w.dealer_id
    where w.dealer_id = ${dealerId}
      and w.auth_user_id = ${userId}
      and w.is_active
      and d.is_active
      and d.subscription_status = 'ACTIVE'
      and d.subscription_expires_at > now()
      and (
        (${allowedRoles.includes("OWNER")} and w.workspace_role = 'OWNER')
        or (${allowedRoles.includes("YARD_MANAGER")} and w.workspace_role = 'YARD_MANAGER')
        or (${allowedRoles.includes("SALESPERSON")} and w.workspace_role = 'SALESPERSON')
        or (${allowedRoles.includes("BROKER")} and w.workspace_role = 'BROKER')
      )
    limit 1
  `;
  if (!rows[0])
    throw new Error("Unauthorized: active dealer membership required.");
  return rows[0] as {
    id: string;
    auth_user_id: string;
    email: string;
    workspace_role: WorkspaceRole;
  };
}

async function resolveCurrentDealerId(
  transaction: TransactionSql,
  userId: string,
  requestedDealerId?: string,
  allowedRoles: readonly WorkspaceRole[] = [],
): Promise<string> {
  if (requestedDealerId) return requestedDealerId;

  const [membership] = await transaction<{ dealer_id: string }[]>`
    select w.dealer_id
    from workers w
    join dealers d on d.id = w.dealer_id
    where w.auth_user_id = ${userId}
      and w.is_active
      and d.is_active
      and d.subscription_status = 'ACTIVE'
      and d.subscription_expires_at > now()
      and (
        (${allowedRoles.includes("OWNER")} and w.workspace_role = 'OWNER')
        or (${allowedRoles.includes("YARD_MANAGER")} and w.workspace_role = 'YARD_MANAGER')
        or (${allowedRoles.includes("SALESPERSON")} and w.workspace_role = 'SALESPERSON')
        or (${allowedRoles.includes("BROKER")} and w.workspace_role = 'BROKER')
      )
    order by w.created_at asc
    limit 1
  `;
  if (!membership)
    throw new Error(
      "No active yard worker account is linked to this sign-in.",
    );
  return membership.dealer_id;
}

export const createCarWithImportCosts = createServerFn({ method: "POST" })
  .middleware([requireRailwayAuth, requireRailwaySystemActiveMiddleware])
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
        ["OWNER", "YARD_MANAGER", "SALESPERSON"],
      );
      const worker = await assertDealerWorker(
        transaction,
        dealerId,
        actor.userId,
        ["OWNER", "YARD_MANAGER", "SALESPERSON"],
      );
      const [dealer] = await transaction<{ active: boolean }[]>`
        select is_active and subscription_status = 'ACTIVE'
          and subscription_expires_at > now() as active
        from dealers where id = ${dealerId}
      `;
      if (!dealer?.active)
        throw new Error("Dealer subscription is expired or inactive.");

      const [car] = await transaction<{ id: string }[]>`
        insert into cars (
          dealer_id, brand, model, chassis_number, selling_price, status_badge,
          year, mileage_km, engine_cc, transmission, fuel, color, body_type, drive,
          booking_deposit_ksh, eta_date, images, description, source_country,
          source_seller, title_status, logbook_number, import_entry_number,
          condition_grade, accident_history, service_history, inspection_notes
        ) values (
          ${dealerId}, ${data.brand}, ${data.model}, ${data.chassisNumber ?? null},
          ${data.sellingPrice}, ${data.statusBadge}, ${data.year}, ${data.mileageKm},
          ${data.engineCc ?? null}, ${data.transmission}, ${data.fuel},
          ${data.color ?? null}, ${data.bodyType ?? null}, ${data.drive ?? null},
          ${data.bookingDepositKsh}, ${data.etaDate ?? null}, ${data.images},
          ${data.description ?? null}, ${data.sourceCountry ?? null},
          ${data.sourceSeller ?? null}, ${data.titleStatus ?? null},
          ${data.logbookNumber ?? null}, ${data.importEntryNumber ?? null},
          ${data.conditionGrade ?? null}, ${data.accidentHistory ?? null},
          ${data.serviceHistory ?? null}, ${data.inspectionNotes ?? null}
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

export const updateDealerCar = createServerFn({ method: "POST" })
  .middleware([requireRailwayAuth, requireRailwaySystemActiveMiddleware])
  .inputValidator((input: z.input<typeof updateCarSchema>) =>
    updateCarSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = principal(context);
    return withRailwayTransaction(actor, async (transaction) => {
      const dealerId = await resolveCurrentDealerId(
        transaction,
        actor.userId,
        undefined,
        ["OWNER", "YARD_MANAGER", "SALESPERSON"],
      );
      await assertDealerWorker(transaction, dealerId, actor.userId, [
        "OWNER",
        "YARD_MANAGER",
        "SALESPERSON",
      ]);

      const [car] = await transaction<{ id: string }[]>`
        update cars
        set brand = ${data.brand},
          model = ${data.model},
          chassis_number = ${data.chassisNumber},
          selling_price = ${data.sellingPrice},
          status_badge = ${data.statusBadge},
          year = ${data.year},
          mileage_km = ${data.mileageKm},
          engine_cc = ${data.engineCc},
          transmission = ${data.transmission},
          fuel = ${data.fuel},
          color = ${data.color},
          body_type = ${data.bodyType},
          drive = ${data.drive},
          booking_deposit_ksh = ${data.bookingDepositKsh},
          eta_date = ${data.etaDate},
          images = ${data.images},
          description = ${data.description},
          source_country = ${data.sourceCountry},
          source_seller = ${data.sourceSeller},
          title_status = ${data.titleStatus},
          logbook_number = ${data.logbookNumber},
          import_entry_number = ${data.importEntryNumber},
          condition_grade = ${data.conditionGrade},
          accident_history = ${data.accidentHistory},
          service_history = ${data.serviceHistory},
          inspection_notes = ${data.inspectionNotes},
          updated_at = now()
        where id = ${data.carId}
          and dealer_id = ${dealerId}
          and not exists (
            select 1 from vehicle_sales vs where vs.car_id = cars.id
          )
        returning id
      `;
      if (!car)
        throw new Error(
          "Vehicle not found in your yard or it has already been sold.",
        );

      await transaction`
        update import_costs
        set cif_purchase_price = ${data.cifPurchasePrice},
          kra_import_duty = ${data.kraImportDuty},
          port_clearance_fees = ${data.portClearanceFees},
          flatbed_transport = ${data.flatbedTransport},
          updated_at = now()
        where car_id = ${car.id} and dealer_id = ${dealerId}
      `;
      await transaction`
        update vehicle_trade_pricing
        set wholesale_price = ${data.brokerWholesalePrice},
          broker_commission_rate_percent = ${data.brokerCommissionRatePercent},
          updated_at = now()
        where car_id = ${car.id} and yard_id = ${dealerId}
      `;

      return { carId: car.id };
    });
  });

export const deleteVehicleImageUploads = createServerFn({ method: "POST" })
  .middleware([requireRailwayAuth, requireRailwaySystemActiveMiddleware])
  .inputValidator((input: z.input<typeof deleteVehicleImageUploadsSchema>) =>
    deleteVehicleImageUploadsSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.imageIds.length === 0) return { deleted: 0 };

    const actor = principal(context);
    return withRailwayTransaction(actor, async (transaction) => {
      const dealerId = await resolveCurrentDealerId(
        transaction,
        actor.userId,
        undefined,
        ["OWNER", "YARD_MANAGER", "SALESPERSON"],
      );
      await assertDealerWorker(transaction, dealerId, actor.userId, [
        "OWNER",
        "YARD_MANAGER",
        "SALESPERSON",
      ]);

      const removed = await transaction<{ id: string }[]>`
        delete from vehicle_images
        where id in ${transaction(data.imageIds)} and yard_id = ${dealerId}
        returning id
      `;
      return { deleted: removed.length };
    });
  });

export const getBrokerDashboard = createServerFn({ method: "GET" })
  .middleware([requireRailwayAuth, requireRailwaySystemActiveMiddleware])
  .handler(async ({ context }) => {
    const actor = principal(context);
    return withRailwayTransaction(actor, async (transaction) => {
      const dealerId = await resolveCurrentDealerId(
        transaction,
        actor.userId,
        undefined,
        ["BROKER"],
      );
      const worker = await assertDealerWorker(
        transaction,
        dealerId,
        actor.userId,
        ["BROKER"],
      );
      const [yard] = await transaction<{ slug: string }[]>`
        select slug from dealers where id = ${dealerId}
      `;
      if (!yard) throw new Error("The assigned car yard could not be found.");

      const cars = await transaction<
        {
          id: string;
          brand: string;
          model: string;
          year: number;
          selling_price: string;
          status_badge: "PURCHASED" | "ON_OCEAN" | "PORT_CLEARING" | "IN_YARD";
          wholesale_price: string;
          broker_commission_rate_percent: string;
        }[]
      >`
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

      const leads = await transaction<
        {
          id: string;
          car_id: string;
          customer_name: string;
          customer_phone: string;
          status: "NEW" | "CONTACTED" | "CONVERTED" | "LOST";
          created_at: string;
          brand: string;
          model: string;
          year: number;
        }[]
      >`
          select l.id, l.car_id, l.customer_name, l.customer_phone, l.status,
            l.created_at::text, c.brand, c.model, c.year
          from broker_leads l
          join cars c on c.id = l.car_id
          where l.salesperson_worker_id = ${worker.id}
          order by l.created_at desc
          limit 100
        `;

      const commissions = await transaction<
        {
          id: string;
          final_sale_price: string;
          commission_rate_percent: string;
          commission_amount: string;
          sold_at: string;
          brand: string;
          model: string;
          year: number;
        }[]
      >`
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
        yardSlug: yard.slug,
        cars,
        leads,
        commissions,
        commissionEarnedKsh: earned.commission_earned,
        activeLeadCount: Number(activeLeadCount.count),
      };
    });
  });

export const submitBrokerLead = createServerFn({ method: "POST" })
  .middleware([requireRailwayAuth, requireRailwaySystemActiveMiddleware])
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
        ["BROKER"],
      );
      const worker = await assertDealerWorker(
        transaction,
        dealerId,
        actor.userId,
        ["BROKER"],
      );
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
        throw new Error(
          "Vehicle not found, not broker-enabled, or no longer available.",
        );
      return { leadId: lead.id };
    });
  });

export const recordCompletedVehicleSale = createServerFn({ method: "POST" })
  .middleware([requireRailwayAuth, requireRailwaySystemActiveMiddleware])
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
        ["OWNER", "YARD_MANAGER", "SALESPERSON"],
      );
      const worker = await assertDealerWorker(
        transaction,
        dealerId,
        actor.userId,
        ["OWNER", "YARD_MANAGER", "SALESPERSON"],
      );
      const [sale] = await transaction<
        {
          id: string;
          commission_amount: string;
          commission_rate_percent: string;
        }[]
      >`
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
        throw new Error(
          "Vehicle not found or a completed sale is already recorded.",
        );

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
  .middleware([requireRailwayAuth, requireRailwaySystemActiveMiddleware])
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

const createDealerWorkerSchema = z.object({
  dealerId: uuid,
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  workspaceRole: z.enum(["SALESPERSON", "BROKER"]),
  temporaryPassword: temporaryPassword.nullable().optional(),
});

export const createDealerWorker = createServerFn({ method: "POST" })
  .middleware([requireRailwayAuth, requireRailwaySystemActiveMiddleware])
  .inputValidator((input: z.input<typeof createDealerWorkerSchema>) =>
    createDealerWorkerSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = principal(context);
    return withRailwayTransaction(actor, async (transaction) => {
      await assertDealerWorker(transaction, data.dealerId, actor.userId, [
        "OWNER",
      ]);

      const [worker] = await transaction<{ id: string }[]>`
        insert into workers (dealer_id, full_name, email, workspace_role)
        values (
          ${data.dealerId}, ${data.fullName}, ${data.email}, ${data.workspaceRole}
        )
        on conflict (dealer_id, email) do nothing
        returning id
      `;
      if (!worker)
        throw new Error(
          "A worker with this email already exists in this yard.",
        );

      let loginCreated = false;
      if (data.temporaryPassword) {
        const userId = await provisionTemporaryLogin({
          email: data.email,
          fullName: data.fullName,
          password: data.temporaryPassword,
        });
        if (userId) {
          await transaction`
            update workers set auth_user_id = ${userId}
            where id = ${worker.id} and dealer_id = ${data.dealerId}
          `;
          loginCreated = true;
        }
      }
      return { workerId: worker.id, loginCreated };
    });
  });

const setSystemActiveSchema = z.object({ active: z.boolean() });

export const setRailwaySystemActive = createServerFn({ method: "POST" })
  .middleware([requireRailwayAuth])
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
  .middleware([requireRailwayAuth, requireRailwaySystemActiveMiddleware])
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

const dealerDashboardSchema = z.object({
  dealerId: uuid.optional(),
  workspaceRole: z.enum(["OWNER", "SALESPERSON"]).default("OWNER"),
});

export const getDealerDashboard = createServerFn({ method: "GET" })
  .middleware([requireRailwayAuth, requireRailwaySystemActiveMiddleware])
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
        [data.workspaceRole],
      );
      const worker = await assertDealerWorker(
        transaction,
        dealerId,
        actor.userId,
        [data.workspaceRole],
      );
      if (worker.workspace_role !== data.workspaceRole)
        throw new Error("This workspace is not available to your worker role.");

      const [dealer] = await transaction<
        {
          showroom_name: string;
          slug: string;
        }[]
      >`
        select showroom_name, slug from dealers where id = ${dealerId}
      `;
      if (!dealer) throw new Error("The assigned car yard could not be found.");

      const cars = await transaction<
        {
          id: string;
          brand: string;
          model: string;
          year: number;
          selling_price: string;
          status_badge: "PURCHASED" | "ON_OCEAN" | "PORT_CLEARING" | "IN_YARD";
          chassis_number: string | null;
          mileage_km: number;
          engine_cc: number | null;
          transmission: string;
          fuel: string;
          color: string | null;
          body_type: string | null;
          drive: string | null;
          booking_deposit_ksh: string;
          eta_date: string | null;
          images: string[];
          description: string | null;
          cif_purchase_price: string;
          kra_import_duty: string;
          port_clearance_fees: string;
          flatbed_transport: string;
          broker_wholesale_price: string;
          broker_commission_rate_percent: string;
          source_country: string | null;
          source_seller: string | null;
          title_status: string | null;
          logbook_number: string | null;
          import_entry_number: string | null;
          condition_grade: string | null;
          accident_history: string | null;
          service_history: string | null;
          inspection_notes: string | null;
        }[]
      >`
      select c.id, c.brand, c.model, c.year, c.selling_price::text,
        c.status_badge, c.chassis_number, c.mileage_km, c.engine_cc,
        c.transmission, c.fuel, c.color, c.body_type, c.drive,
        c.booking_deposit_ksh::text, c.eta_date::text, c.images, c.description,
        coalesce(ic.cif_purchase_price, 0)::text as cif_purchase_price,
        coalesce(ic.kra_import_duty, 0)::text as kra_import_duty,
        coalesce(ic.port_clearance_fees, 0)::text as port_clearance_fees,
        coalesce(ic.flatbed_transport, 0)::text as flatbed_transport,
        coalesce(tp.wholesale_price, 0)::text as broker_wholesale_price,
        coalesce(tp.broker_commission_rate_percent, 0)::text as broker_commission_rate_percent,
        c.source_country, c.source_seller, c.title_status, c.logbook_number,
        c.import_entry_number, c.condition_grade, c.accident_history,
        c.service_history, c.inspection_notes
      from cars c
      left join import_costs ic on ic.car_id = c.id and ic.dealer_id = c.dealer_id
      left join vehicle_trade_pricing tp on tp.car_id = c.id and tp.yard_id = c.dealer_id
      where c.dealer_id = ${dealerId}
        and not exists (
          select 1 from vehicle_sales vs where vs.car_id = c.id
        )
      order by c.created_at desc
      limit 100
    `;

      const staff = await transaction<
        {
          id: string;
          full_name: string;
          email: string;
          workspace_role: WorkspaceRole;
          is_active: boolean;
        }[]
      >`
      select id, full_name, email, workspace_role, is_active
      from workers
      where dealer_id = ${dealerId}
        and (
          ${data.workspaceRole === "OWNER"}
          or (workspace_role = 'BROKER' and is_active)
        )
      order by created_at asc
    `;

      const logs = await transaction<
        {
          id: string;
          worker_email: string;
          action_performed: string;
          record_id: string;
          timestamp: string;
        }[]
      >`
      select id, worker_email, action_performed, record_id, "timestamp"::text
      from system_logs
      where dealer_id = ${dealerId}
      order by "timestamp" desc
      limit 50
    `;

      const sales = await transaction<
        {
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
        }[]
      >`
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

      return {
        dealerId,
        yardName: dealer.showroom_name,
        yardSlug: dealer.slug,
        currentRole: worker.workspace_role,
        cars: [...cars],
        staff: [...staff],
        logs: [...logs],
        sales: [...sales],
      };
    });
  });

export const linkAuthenticatedWorker = createServerFn({ method: "POST" })
  .middleware([
    requireRailwayAuthAllowingTemporaryPassword,
    requireRailwaySystemActiveMiddleware,
  ])
  .handler(async ({ context }) => {
    const email =
      typeof context.claims.email === "string" ? context.claims.email : "";
    // Owner-issued logins are linked at creation; only Google-verified emails are linked here.
    if (!email || !context.emailVerified || context.mustChangePassword)
      return { linkedWorkers: 0 };

    const actor = { userId: uuid.parse(context.userId), workerEmail: email };
    return withRailwayTransaction(actor, async (transaction) => {
      const [result] = await transaction<{ linked_count: number }[]>`
        select link_authenticated_worker_identity() as linked_count
      `;
      if (!result)
        throw new Error("Worker identity linking returned no result.");
      return { linkedWorkers: Number(result.linked_count) };
    });
  });

export const changeTemporaryPassword = createServerFn({ method: "POST" })
  .middleware([requireRailwayAuthAllowingTemporaryPassword])
  .inputValidator((input: z.input<typeof changeTemporaryPasswordSchema>) =>
    changeTemporaryPasswordSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!context.mustChangePassword)
      throw new Error("Your password does not need to be replaced.");
    if (data.newPassword === data.currentPassword)
      throw new Error("Choose a new password that differs from the temporary one.");
    const request = getRequest();
    if (!request) throw new Error("Unauthorized: request context is unavailable.");

    // Throws when the temporary password is wrong, so the flag below is never cleared without a real change.
    await getRailwayAuth().api.changePassword({
      body: {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      },
      headers: request.headers,
    });
    await getRailwayClient()`
      update "user" set "mustChangePassword" = false
      where id = ${uuid.parse(context.userId)}::uuid
    `;
    return { changed: true };
  });

export const setAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireRailwayAuth])
  .inputValidator((input: z.input<typeof setAccountPasswordSchema>) =>
    setAccountPasswordSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!context.emailVerified)
      throw new Error("Sign in with Google before adding a password.");
    const request = getRequest();
    if (!request) throw new Error("Unauthorized: request context is unavailable.");
    const { setPassword } = getRailwayAuth().api;
    if (!setPassword) throw new Error("Password setup is unavailable.");
    await setPassword({
      body: { newPassword: data.newPassword },
      headers: request.headers,
    });
    return { passwordSet: true };
  });

export const getDeveloperDashboard = createServerFn({ method: "GET" })
  .middleware([requireRailwayAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const actor = principal(context);
    return withRailwayTransaction(
      { ...actor, superAdmin: true, allowMaintenance: true },
      async (transaction) => {
        const dealers = await transaction<
          {
            id: string;
            showroom_name: string;
            location: string;
            slug: string;
            whatsapp_phone: string;
            is_active: boolean;
            subscription_status: "ACTIVE" | "EXPIRED";
            subscription_expires_at: string;
          }[]
        >`
          select id, showroom_name, location, slug, whatsapp_phone, is_active,
            subscription_status, subscription_expires_at::text
          from dealers
          order by subscription_expires_at desc
          limit 100
      `;

        const workers = await transaction<
          {
            dealer_id: string;
            full_name: string;
            email: string;
            workspace_role: WorkspaceRole;
            is_active: boolean;
            login_linked: boolean;
          }[]
        >`
          select dealer_id, full_name, email, workspace_role, is_active,
            auth_user_id is not null as login_linked
          from workers
          where dealer_id in (
            select id from dealers
            order by subscription_expires_at desc
            limit 100
          )
          order by dealer_id, created_at
      `;

        type DeveloperWorkerSummary = {
          dealer_id: string;
          full_name: string;
          email: string;
          workspace_role: WorkspaceRole;
          is_active: boolean;
          login_linked: boolean;
        };
        const staffByDealer = new Map<string, DeveloperWorkerSummary[]>();
        for (const worker of workers) {
          const staff = staffByDealer.get(worker.dealer_id) ?? [];
          staff.push(worker);
          staffByDealer.set(worker.dealer_id, staff);
        }

        const payments = await transaction<
          {
            provider: "stripe" | "mpesa";
            amount_ksh: string;
            paid_at: string;
          }[]
        >`
        select provider, amount_ksh::text, paid_at::text
        from subscription_events
        where paid_at >= date_trunc('month', now())
        order by paid_at desc
        limit 200
      `;

        return {
          dealers: dealers.map((dealer) => ({
            ...dealer,
            workers: staffByDealer.get(dealer.id) ?? [],
          })),
          payments,
        };
      },
    );
  });

const setDealerAvailabilitySchema = z.object({
  dealerIds: z.array(uuid).min(1).max(100),
  active: z.boolean(),
});

export const setDealerAvailability = createServerFn({ method: "POST" })
  .middleware([requireRailwayAuth])
  .inputValidator((input: z.input<typeof setDealerAvailabilitySchema>) =>
    setDealerAvailabilitySchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const actor = principal(context);
    return withRailwayTransaction(
      { ...actor, superAdmin: true, allowMaintenance: true },
      async (transaction) => {
        const updatedIds: string[] = [];
        for (const dealerId of new Set(data.dealerIds)) {
          const [dealer] = await transaction<{ id: string }[]>`
            update dealers
            set is_active = ${data.active}, updated_at = now()
            where id = ${dealerId}
            returning id
          `;
          if (!dealer) {
            throw new Error(
              "A selected yard could not be updated. Refresh the dashboard and try again.",
            );
          }
          updatedIds.push(dealer.id);
        }

        return { dealerIds: updatedIds, active: data.active };
      },
    );
  });

const deleteDealerSchema = z.object({ dealerId: uuid });

export const deleteDealer = createServerFn({ method: "POST" })
  .middleware([requireRailwayAuth])
  .inputValidator((input: z.input<typeof deleteDealerSchema>) =>
    deleteDealerSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const actor = principal(context);
    return withRailwayTransaction(
      { ...actor, superAdmin: true, allowMaintenance: true },
      async (transaction) => {
        const [dealer] = await transaction<{ id: string }[]>`
          delete from dealers
          where id = ${data.dealerId}
          returning id
        `;
        if (!dealer)
          throw new Error(
            "Car yard not found. Refresh the dashboard and try again.",
          );
        return { dealerId: dealer.id };
      },
    );
  });

export const createDealerAccount = createServerFn({ method: "POST" })
  .middleware([requireRailwayAuth])
  .inputValidator((input: z.input<typeof createDealerSchema>) =>
    createDealerSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const actor = principal(context);
    return withRailwayTransaction(
      { ...actor, superAdmin: true, allowMaintenance: true },
      async (transaction) => {
        const [dealer] = await transaction<{ id: string }[]>`
          insert into dealers (
            showroom_name, location, subscription_status,
            subscription_expires_at, slug, whatsapp_phone
          ) values (
            ${data.showroomName},
            ${data.location},
            'ACTIVE',
            ${data.subscriptionExpiresAt},
            ${data.slug},
            ${data.whatsappPhone}
          )
          returning id
        `;
        if (!dealer) throw new Error("Could not create the dealer account.");

        const ownerUserId = data.ownerTemporaryPassword
          ? await provisionTemporaryLogin({
              email: data.ownerEmail,
              fullName: data.ownerName,
              password: data.ownerTemporaryPassword,
            })
          : null;
        const [owner] = await transaction<{ id: string }[]>`
          insert into workers (
            dealer_id, full_name, email, workspace_role, auth_user_id
          )
          values (
            ${dealer.id}, ${data.ownerName}, ${data.ownerEmail}, 'OWNER', ${ownerUserId}
          )
          returning id
        `;
        if (!owner)
          throw new Error("Could not create the dealer owner account.");

        return {
          dealerId: dealer.id,
          ownerWorkerId: owner.id,
          loginCreated: ownerUserId !== null,
        };
      },
    );
  });
