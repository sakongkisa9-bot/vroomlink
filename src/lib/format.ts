import type { VehicleStatus } from "./catalog.functions";

export const formatKsh = (n: number) => `KSh ${Math.round(n).toLocaleString("en-KE")}`;

export const STATUS_LABEL: Record<VehicleStatus, string> = {
  in_yard: "In Yard (Westlands)",
  on_ocean: "On the Ocean (Importing)",
  port_clearing: "Port Clearing (Mombasa)",
  purchased_japan: "Purchased in Japan",
};

/** Public badge: green only when physically in the yard, ocean blue for anything still importing. */
export const isInYard = (s: VehicleStatus) => s === "in_yard";
