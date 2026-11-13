export const VEHICLE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const VEHICLE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const VEHICLE_IMAGE_MAX_COUNT = 12;

const IMAGE_URL_PREFIX = "/api/vehicle-images/";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isVehicleImageContentType(
  value: string,
): value is (typeof VEHICLE_IMAGE_TYPES)[number] {
  return (VEHICLE_IMAGE_TYPES as readonly string[]).includes(value);
}

export function vehicleImageIdFromUrl(url: string): string | null {
  if (!url.startsWith(IMAGE_URL_PREFIX)) return null;
  const id = url.slice(IMAGE_URL_PREFIX.length);
  return UUID_PATTERN.test(id) ? id : null;
}

export async function uploadVehicleImages(files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  const body = new FormData();
  for (const file of files) body.append("files", file);

  const response = await fetch("/api/vehicle-images", {
    method: "POST",
    body,
    credentials: "same-origin",
  });
  const payload = (await response.json().catch(() => null)) as {
    urls?: string[];
    error?: string;
  } | null;
  if (!response.ok || !payload?.urls) {
    throw new Error(payload?.error ?? "Could not upload vehicle images.");
  }
  return payload.urls;
}
