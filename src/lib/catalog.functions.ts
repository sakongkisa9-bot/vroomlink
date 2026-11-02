import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireRailwaySystemActiveMiddleware } from "@/integrations/railway-middleware";

export type { PublicVehicle, PublicYard, VehicleStatus } from "./catalog.types";

export const getSystemStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const { isRailwaySystemActive } = await import("./railway.server");
    return { active: await isRailwaySystemActive() };
  },
);

export const listPublicYards = createServerFn({ method: "GET" })
  .middleware([requireRailwaySystemActiveMiddleware])
  .handler(async () => {
    const { listRailwayPublicYards } = await import("./railway.server");
    return listRailwayPublicYards();
  });

const publicYardSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export const getPublicYardMarketplace = createServerFn({ method: "GET" })
  .middleware([requireRailwaySystemActiveMiddleware])
  .inputValidator((input: z.input<typeof publicYardSchema>) =>
    publicYardSchema.parse(input),
  )
  .handler(async ({ data }) => {
    const { getRailwayPublicYardMarketplace } =
      await import("./railway.server");
    return getRailwayPublicYardMarketplace(data.slug);
  });

export const getPublicVehicle = createServerFn({ method: "GET" })
  .middleware([requireRailwaySystemActiveMiddleware])
  .inputValidator((input: { id: string; yardSlug?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        yardSlug: publicYardSchema.shape.slug.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getRailwayPublicVehicle } = await import("./railway.server");
    return getRailwayPublicVehicle(data.id, data.yardSlug);
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
