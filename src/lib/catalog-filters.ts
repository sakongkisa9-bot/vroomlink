import type { PublicVehicle } from "./catalog.types";

export type CatalogFilters = {
  q?: string | undefined;
  make?: string | undefined;
  model?: string | undefined;
  min?: number | undefined;
  max?: number | undefined;
  loc?: "yard" | "importing" | undefined;
};

export function applyFilters(
  list: PublicVehicle[],
  filters: CatalogFilters,
): PublicVehicle[] {
  const query = filters.q?.toLowerCase().trim();
  return list.filter((vehicle) => {
    if (
      query &&
      !`${vehicle.make} ${vehicle.model} ${vehicle.year}`
        .toLowerCase()
        .includes(query)
    ) {
      return false;
    }
    if (filters.make && vehicle.make !== filters.make) return false;
    if (filters.model && vehicle.model !== filters.model) return false;
    if (filters.min != null && vehicle.price_ksh < filters.min) return false;
    if (filters.max != null && vehicle.price_ksh > filters.max) return false;
    if (filters.loc === "yard" && vehicle.status !== "in_yard") return false;
    if (filters.loc === "importing" && vehicle.status === "in_yard")
      return false;
    return true;
  });
}
