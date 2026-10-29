export type VehicleStatus =
  "purchased_japan" | "on_ocean" | "port_clearing" | "in_yard";

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
