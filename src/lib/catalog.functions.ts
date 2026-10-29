import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/types";

export type VehicleStatus = Database["public"]["Enums"]["vehicle_status"];

export type PublicVehicle = {
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
  price_ksh: number;
  booking_deposit_ksh: number;
  status: VehicleStatus;
  eta_date: string | null;
  images: string[];
  description: string | null;
  yard: { name: string; location: string; whatsapp_phone: string } | null;
};

const PUBLIC_COLUMNS =
  "id, make, model, year, mileage_km, engine_cc, transmission, fuel, color, body_type, drive, price_ksh, booking_deposit_ksh, status, eta_date, images, description, yard:yards(name, location, whatsapp_phone)";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const getSystemStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await publicClient().from("system_settings").select("is_system_active").eq("id", 1).maybeSingle();
  return { active: data?.is_system_active ?? true };
});

export const listPublicVehicles = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await publicClient()
    .from("vehicles")
    .select(PUBLIC_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PublicVehicle[];
});

export const getPublicVehicle = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await publicClient()
      .from("vehicles")
      .select(PUBLIC_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as unknown as PublicVehicle | null;
  });

const depositSchema = z.object({
  vehicleId: z.string().uuid(),
  customerName: z.string().trim().min(2).max(100),
  customerPhone: z.string().trim().regex(/^(\+?254|0)[17]\d{8}$/, "Enter a valid Kenyan phone number"),
  ref: z.string().uuid().optional(),
});

// Simulated payment: records a pending deposit. Replace with a real M-Pesa STK push later.
export const createBookingDeposit = createServerFn({ method: "POST" })
  .inputValidator((input: z.input<typeof depositSchema>) => depositSchema.parse(input))
  .handler(async ({ data }) => {
    const pub = publicClient();
    const { data: status } = await pub.from("system_settings").select("is_system_active").eq("id", 1).maybeSingle();
    if (status && !status.is_system_active) throw new Error("System under maintenance");
    const { data: v } = await pub.from("vehicles").select("id, booking_deposit_ksh").eq("id", data.vehicleId).maybeSingle();
    if (!v) throw new Error("Vehicle not found");
    const { supabaseAdmin } = await import("@/integrations/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("booking_deposits")
      .insert({
        vehicle_id: v.id,
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        amount_ksh: v.booking_deposit_ksh,
        referral_broker_id: data.ref ?? null,
        status: "simulated_paid",
      })
      .select("id")
      .single();
    if (error) throw new Error("Could not record deposit");
    return { reference: row.id.slice(0, 8).toUpperCase(), amount: v.booking_deposit_ksh };
  });
