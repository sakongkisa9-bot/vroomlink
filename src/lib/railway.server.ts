import postgres, { type TransactionSql } from "postgres";
import type { PublicVehicle, VehicleStatus } from "./catalog.types";

let client: ReturnType<typeof postgres> | undefined;

export class SystemMaintenanceError extends Error {
  readonly statusCode = 503;

  constructor() {
    super("System under maintenance");
    this.name = "SystemMaintenanceError";
  }
}

export function getRailwayClient() {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error(
      "Missing DATABASE_URL. Configure the Railway PostgreSQL connection for the server.",
    );
  }

  client ??= postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",
  });
  return client;
}

type TransactionOptions = {
  userId?: string;
  workerEmail?: string;
  superAdmin?: boolean;
  allowMaintenance?: boolean;
};

export async function withRailwayTransaction<T>(
  options: TransactionOptions,
  operation: (transaction: TransactionSql) => Promise<T>,
): Promise<T> {
  const result = await getRailwayClient().begin(async (transaction) => {
    await transaction`set local role vroomlink_app`;
    await transaction`
      select
        set_config('app.user_id', ${options.userId ?? ""}, true),
        set_config('app.worker_email', ${options.workerEmail ?? "system"}, true),
        set_config('app.is_super_admin', ${options.superAdmin ? "true" : "false"}, true)
    `;

    const [settings] = await transaction<{ is_system_active: boolean }[]>`
      select is_system_active from global_settings where id = 1
    `;
    if (!settings)
      throw new Error("Global system settings have not been initialized.");
    if (!settings.is_system_active && !options.allowMaintenance) {
      throw new SystemMaintenanceError();
    }

    await transaction`select expire_dealer_subscriptions()`;
    return { value: await operation(transaction) };
  });
  return result.value;
}

export async function isRailwaySystemActive(): Promise<boolean> {
  const result = await getRailwayClient().begin(async (transaction) => {
    await transaction`set local role vroomlink_app`;
    const [settings] = await transaction<{ is_system_active: boolean }[]>`
      select is_system_active from global_settings where id = 1
    `;
    if (!settings)
      throw new Error("Global system settings have not been initialized.");
    return { active: settings.is_system_active };
  });
  return result.active;
}

type PublicVehicleRow = {
  id: string;
  make: string;
  model: string;
  year: number;
  mileage_km: number;
  engine_cc: number | null;
  transmission: string;
  fuel: string;
  color: string | null;
  body_type: string | null;
  drive: string | null;
  price_ksh: string | number;
  booking_deposit_ksh: string | number;
  status: "PURCHASED" | "ON_OCEAN" | "PORT_CLEARING" | "IN_YARD";
  eta_date: string | null;
  images: string[];
  description: string | null;
  yard_name: string;
  yard_location: string;
  whatsapp_phone: string;
};

const publicVehicleStatus: Record<PublicVehicleRow["status"], VehicleStatus> = {
  PURCHASED: "purchased_japan",
  ON_OCEAN: "on_ocean",
  PORT_CLEARING: "port_clearing",
  IN_YARD: "in_yard",
};

function safeKsh(value: string | number, field: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`Railway returned an invalid ${field} value.`);
  }
  return amount;
}

function mapPublicVehicle(row: PublicVehicleRow): PublicVehicle {
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    year: row.year,
    mileage_km: row.mileage_km,
    engine_cc: row.engine_cc,
    transmission: row.transmission,
    fuel: row.fuel,
    color: row.color,
    body_type: row.body_type,
    drive: row.drive,
    price_ksh: safeKsh(row.price_ksh, "selling price"),
    booking_deposit_ksh: safeKsh(row.booking_deposit_ksh, "booking deposit"),
    status: publicVehicleStatus[row.status],
    eta_date: row.eta_date,
    images: row.images,
    description: row.description,
    yard: {
      name: row.yard_name,
      location: row.yard_location,
      whatsapp_phone: row.whatsapp_phone,
    },
  };
}

const publicVehicleSelect = `
  select
    c.id,
    c.brand as make,
    c.model,
    c.year,
    c.mileage_km,
    c.engine_cc,
    c.transmission,
    c.fuel,
    c.color,
    c.body_type,
    c.drive,
    c.selling_price as price_ksh,
    c.booking_deposit_ksh,
    c.status_badge as status,
    c.eta_date::text as eta_date,
    c.images,
    c.description,
    d.showroom_name as yard_name,
    d.location as yard_location,
    d.whatsapp_phone
  from cars c
  join dealers d on d.id = c.dealer_id
  where c.is_published
    and d.subscription_status = 'ACTIVE'
    and d.subscription_expires_at > now()
`;

export async function listRailwayPublicVehicles(): Promise<PublicVehicle[]> {
  return withRailwayTransaction({}, async (transaction) => {
    const rows = await transaction.unsafe<PublicVehicleRow[]>(
      `${publicVehicleSelect} order by c.created_at desc`,
    );
    return rows.map(mapPublicVehicle);
  });
}

export async function getRailwayPublicVehicle(
  id: string,
): Promise<PublicVehicle | null> {
  return withRailwayTransaction({}, async (transaction) => {
    const rows = await transaction.unsafe<PublicVehicleRow[]>(
      `${publicVehicleSelect} and c.id = $1 limit 1`,
      [id],
    );
    return rows[0] ? mapPublicVehicle(rows[0]) : null;
  });
}

export async function createRailwayBookingDeposit(input: {
  vehicleId: string;
  customerName: string;
  customerPhone: string;
  referralBrokerId: string | null;
}): Promise<{ reference: string; amount: number }> {
  return withRailwayTransaction({}, async (transaction) => {
    await transaction`select set_config('app.booking_deposit_return', 'true', true)`;
    const rows = await transaction<
      { id: string; amount_ksh: string | number }[]
    >`
      insert into booking_deposits (
        vehicle_id, dealer_id, customer_name, customer_phone, referral_broker_id, amount_ksh
      )
      select c.id, c.dealer_id, ${input.customerName}, ${input.customerPhone}, ${input.referralBrokerId}, c.booking_deposit_ksh
      from cars c
      join dealers d on d.id = c.dealer_id
      where c.id = ${input.vehicleId}
        and c.is_published
        and d.subscription_status = 'ACTIVE'
        and d.subscription_expires_at > now()
      returning id, amount_ksh
    `;
    const deposit = rows[0];
    if (!deposit) throw new Error("Vehicle not found or no longer available.");
    return {
      reference: deposit.id.slice(0, 8).toUpperCase(),
      amount: safeKsh(deposit.amount_ksh, "booking deposit"),
    };
  });
}

export async function requireRailwaySystemActive(): Promise<void> {
  if (!(await isRailwaySystemActive())) throw new SystemMaintenanceError();
}
