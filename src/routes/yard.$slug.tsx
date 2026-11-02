import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { formatKsh } from "@/lib/format";
import { applyFilters } from "@/lib/catalog-filters";
import { getPublicYardMarketplace } from "@/lib/catalog.functions";

const searchSchema = z.object({
  q: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  min: z.coerce.number().optional(),
  max: z.coerce.number().optional(),
  loc: z.enum(["yard", "importing"]).optional(),
  ref: z.string().optional(),
});

export const Route = createFileRoute("/yard/$slug")({
  validateSearch: searchSchema,
  loader: async ({ params }) => {
    const marketplace = await getPublicYardMarketplace({
      data: { slug: params.slug },
    });
    if (!marketplace.yard) throw notFound();
    return { yard: marketplace.yard, vehicles: marketplace.vehicles };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.yard.name} Marketplace | VroomLink` },
          {
            name: "description",
            content: `Browse available cars at ${loaderData.yard.name} in ${loaderData.yard.location}.`,
          },
        ]
      : [{ title: "Car yard unavailable | VroomLink" }],
  }),
  notFoundComponent: () => (
    <div className="p-12 text-center">
      <p className="mb-4 text-muted-foreground">
        This car yard is unavailable.
      </p>
      <Link to="/" className="font-medium text-primary">
        Choose another yard
      </Link>
    </div>
  ),
  component: YardMarketplace,
});

function YardMarketplace() {
  const { slug } = Route.useParams();
  const { yard, vehicles } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/yard/$slug" });
  const set = (patch: Partial<typeof search>) =>
    navigate({
      search: (current) => ({ ...current, ...patch }),
      replace: true,
    });

  const makes = useMemo(
    () => [...new Set(vehicles.map((vehicle) => vehicle.make))].sort(),
    [vehicles],
  );
  const models = useMemo(
    () =>
      [
        ...new Set(
          vehicles
            .filter((vehicle) => !search.make || vehicle.make === search.make)
            .map((vehicle) => vehicle.model),
        ),
      ].sort(),
    [search.make, vehicles],
  );
  const results = applyFilters(vehicles, search);
  const field =
    "h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="min-h-screen">
      <SiteHeader q={search.q} onSearch={(q) => set({ q: q || undefined })} />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <Link
          to="/"
          className="mb-5 inline-flex text-sm font-medium text-primary hover:underline"
        >
          ← All car yards
        </Link>
        <header className="mb-7 rounded-2xl border bg-card p-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Car yard marketplace
          </p>
          <h1 className="mt-2 text-3xl font-bold">{yard.name}</h1>
          <p className="mt-1 text-muted-foreground">{yard.location}</p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          <aside className="h-fit space-y-5 rounded-2xl border bg-card p-5 lg:sticky lg:top-24">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Filter this yard&apos;s cars
            </h2>
            <label className="block space-y-1.5 text-sm font-medium">
              Make
              <select
                className={field}
                value={search.make ?? ""}
                onChange={(event) =>
                  set({
                    make: event.target.value || undefined,
                    model: undefined,
                  })
                }
              >
                <option value="">All makes</option>
                {makes.map((make) => (
                  <option key={make}>{make}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Model
              <select
                className={field}
                value={search.model ?? ""}
                onChange={(event) =>
                  set({ model: event.target.value || undefined })
                }
              >
                <option value="">All models</option>
                {models.map((model) => (
                  <option key={model}>{model}</option>
                ))}
              </select>
            </label>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Price range (KSh)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  className={field}
                  value={search.min ?? ""}
                  onChange={(event) =>
                    set({
                      min: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
                <input
                  type="number"
                  placeholder="Max"
                  className={field}
                  value={search.max ?? ""}
                  onChange={(event) =>
                    set({
                      max: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Vehicle location</p>
              <div className="grid gap-2">
                {(
                  [
                    [undefined, "All"],
                    ["yard", "In yard"],
                    ["importing", "Importing"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => set({ loc: value })}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition ${search.loc === value ? "border-primary bg-accent font-semibold text-accent-foreground" : "hover:bg-muted"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate({ search: {}, replace: true })}
              className="text-sm font-medium text-primary hover:underline"
            >
              Clear filters
            </button>
          </aside>

          <main>
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="text-2xl font-bold">Available cars</h2>
              <span className="text-sm text-muted-foreground">
                {results.length} vehicles
              </span>
            </div>
            {results.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
                No cars in this yard match these filters.
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {results.map((vehicle) => (
                  <Link
                    key={vehicle.id}
                    to="/cars/$id"
                    params={{ id: vehicle.id }}
                    search={{
                      yard: slug,
                      ...(search.ref ? { ref: search.ref } : {}),
                    }}
                    className="group overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                      <img
                        src={vehicle.images[0]}
                        alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                        loading="lazy"
                        width={1280}
                        height={832}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                      <StatusBadge
                        status={vehicle.status}
                        className="absolute left-3 top-3"
                      />
                    </div>
                    <div className="space-y-1 p-4">
                      <h3 className="font-semibold">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {vehicle.mileage_km.toLocaleString()} km ·{" "}
                        {vehicle.fuel} · {vehicle.transmission}
                      </p>
                      <p className="pt-2 text-lg font-bold text-primary">
                        {formatKsh(vehicle.price_ksh)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
