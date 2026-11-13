import { createFileRoute } from "@tanstack/react-router";
import { getRailwayAuth } from "@/integrations/railway-auth.server";
import { withRailwayTransaction } from "@/lib/railway.server";
import {
  VEHICLE_IMAGE_MAX_BYTES,
  VEHICLE_IMAGE_MAX_COUNT,
  isVehicleImageContentType,
} from "@/lib/vehicle-images";

function json(body: unknown, status: number) {
  return Response.json(body, { status });
}

function matchesImageSignature(type: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (type === "image/png")
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const text = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  return text(0, 4) === "RIFF" && text(8, 12) === "WEBP";
}

async function uploadImages({ request }: { request: Request }) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return json({ error: "Cross-site uploads are not allowed." }, 403);

  const session = await getRailwayAuth().api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in to upload vehicle images." }, 401);
  if ((session.user as { mustChangePassword?: boolean }).mustChangePassword)
    return json({ error: "Change your temporary password first." }, 403);

  const files = (await request.formData())
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);
  if (files.length === 0 || files.length > VEHICLE_IMAGE_MAX_COUNT)
    return json({ error: `Upload between 1 and ${VEHICLE_IMAGE_MAX_COUNT} images.` }, 400);

  const prepared: { type: string; bytes: Buffer }[] = [];
  for (const file of files) {
    if (!isVehicleImageContentType(file.type) || file.size > VEHICLE_IMAGE_MAX_BYTES)
      return json({ error: `${file.name} must be JPEG, PNG, or WebP and at most 10 MB.` }, 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!matchesImageSignature(file.type, bytes))
      return json({ error: `${file.name} is not a valid ${file.type} image.` }, 400);
    prepared.push({ type: file.type, bytes });
  }

  try {
    const ids = await withRailwayTransaction(
      { userId: session.user.id, workerEmail: session.user.email },
      async (transaction) => {
        const [membership] = await transaction<{ dealer_id: string }[]>`
          select w.dealer_id
          from workers w
          join dealers d on d.id = w.dealer_id
          where w.auth_user_id = ${session.user.id}
            and w.is_active
            and d.is_active
            and d.subscription_status = 'ACTIVE'
            and d.subscription_expires_at > now()
            and w.workspace_role in ('OWNER', 'YARD_MANAGER', 'SALESPERSON')
          order by w.created_at asc
          limit 1
        `;
        if (!membership) throw new Error("NO_YARD_ACCESS");

        const inserted: string[] = [];
        for (const image of prepared) {
          const [row] = await transaction<{ id: string }[]>`
            insert into vehicle_images (yard_id, content_type, data)
            values (${membership.dealer_id}, ${image.type}, ${image.bytes})
            returning id
          `;
          if (!row) throw new Error("Could not store the vehicle image.");
          inserted.push(row.id);
        }
        return inserted;
      },
    );
    return json({ urls: ids.map((id) => `/api/vehicle-images/${id}`) }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "NO_YARD_ACCESS")
      return json({ error: "Your account is not an active yard worker." }, 403);
    console.error("Vehicle image upload failed", error);
    return json({ error: "Could not store vehicle images." }, 500);
  }
}

export const Route = createFileRoute("/api/vehicle-images")({
  server: { handlers: { POST: uploadImages } },
});
