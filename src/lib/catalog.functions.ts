import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireRailwaySystemActiveMiddleware } from "@/integrations/railway-middleware";

export type { PublicVehicle, VehicleStatus } from "./catalog.types";

export const getSystemStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const { isRailwaySystemActive } = await import("./railway.server");
    return { active: await isRailwaySystemActive() };
  },
);

export const listPublicVehicles = createServerFn({ method: "GET" })
  .middleware([requireRailwaySystemActiveMiddleware])
  .handler(async () => {
    const { listRailwayPublicVehicles } = await import("./railway.server");
    return listRailwayPublicVehicles();
  });

export const getPublicVehicle = createServerFn({ method: "GET" })
  .middleware([requireRailwaySystemActiveMiddleware])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getRailwayPublicVehicle } = await import("./railway.server");
    return getRailwayPublicVehicle(data.id);
  });

const depositSchema = z.object({
  vehicleId: z.string().uuid(),
  customerName: z.string().trim().min(2).max(100),
  customerPhone: z
    .string()
    .trim()
    .regex(/^(\+?254|0)[17]\d{8}$/, "Enter a valid Kenyan phone number"),
  ref: z.string().uuid().optional(),
});

export const createBookingDeposit = createServerFn({ method: "POST" })
  .middleware([requireRailwaySystemActiveMiddleware])
  .inputValidator((input: z.input<typeof depositSchema>) =>
    depositSchema.parse(input),
  )
  .handler(async ({ data }) => {
    const { createRailwayBookingDeposit } = await import("./railway.server");
    return createRailwayBookingDeposit({
      vehicleId: data.vehicleId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      referralBrokerId: data.ref ?? null,
    });
  });
