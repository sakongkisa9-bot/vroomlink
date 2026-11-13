import { createFileRoute } from "@tanstack/react-router";
import { withRailwayTransaction } from "@/lib/railway.server";
import { vehicleImageIdFromUrl } from "@/lib/vehicle-images";

export const Route = createFileRoute("/api/vehicle-images/$id")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { id: string } }) => {
        const id = vehicleImageIdFromUrl(`/api/vehicle-images/${params.id}`);
        if (!id) return new Response("Not found", { status: 404 });

        const image = await withRailwayTransaction({}, async (transaction) => {
          const [row] = await transaction<{ content_type: string; data: Buffer }[]>`
            select content_type, data from vehicle_images where id = ${id}
          `;
          return row ?? null;
        });
        if (!image) return new Response("Not found", { status: 404 });

        return new Response(new Uint8Array(image.data), {
          headers: {
            "content-type": image.content_type,
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
