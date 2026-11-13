import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadVehicleImages, vehicleImageIdFromUrl } from "@/lib/vehicle-images";

const imageId = "a0f1b2c3-d4e5-4789-a123-123456789abc";

afterEach(() => vi.unstubAllGlobals());

describe("Railway vehicle images", () => {
  it("accepts only local image URLs with a UUID", () => {
    expect(vehicleImageIdFromUrl(`/api/vehicle-images/${imageId}`)).toBe(imageId);
    expect(vehicleImageIdFromUrl(`/api/vehicle-images/${imageId}?other=1`)).toBeNull();
    expect(vehicleImageIdFromUrl(`https://example.com/api/vehicle-images/${imageId}`)).toBeNull();
    expect(vehicleImageIdFromUrl("/api/vehicle-images/not-a-uuid")).toBeNull();
  });

  it("uploads selected images and returns their URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ urls: [`/api/vehicle-images/${imageId}`] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["image"], "car.jpg", { type: "image/jpeg" });

    await expect(uploadVehicleImages([file])).resolves.toEqual([
      `/api/vehicle-images/${imageId}`,
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/vehicle-images");
    expect(fetchMock.mock.calls[0]?.[1].body.getAll("files")).toEqual([file]);
  });

  it("propagates upload errors and skips empty selections", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Upload rejected." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadVehicleImages([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(uploadVehicleImages([new File(["x"], "car.jpg")])).rejects.toThrow(
      "Upload rejected.",
    );
  });
});