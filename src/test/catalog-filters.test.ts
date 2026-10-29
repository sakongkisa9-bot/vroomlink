import { describe, expect, it } from "vitest";
import { applyFilters } from "@/routes/index";
import type { PublicVehicle } from "@/lib/catalog.functions";

const car = (p: Partial<PublicVehicle>): PublicVehicle => ({
  id: "x", make: "Toyota", model: "Harrier", year: 2020, mileage_km: 0, engine_cc: null, transmission: "Automatic",
  fuel: "Petrol", color: null, body_type: null, drive: null, price_ksh: 5_000_000, booking_deposit_ksh: 100_000,
  status: "in_yard", eta_date: null, images: [], description: null, yard: null, ...p,
});

describe("catalog location filter", () => {
  const list = [car({ id: "a", status: "in_yard" }), car({ id: "b", status: "on_ocean" }), car({ id: "c", status: "port_clearing" })];
  it("In Yard shows only cars physically in the yard", () => {
    expect(applyFilters(list, { loc: "yard" }).map((v) => v.id)).toEqual(["a"]);
  });
  it("Importing shows every car not yet in the yard", () => {
    expect(applyFilters(list, { loc: "importing" }).map((v) => v.id)).toEqual(["b", "c"]);
  });
  it("price range is inclusive", () => {
    expect(applyFilters([car({ price_ksh: 3_000_000 })], { min: 3_000_000, max: 3_000_000 })).toHaveLength(1);
  });
});
