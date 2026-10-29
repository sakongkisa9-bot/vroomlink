import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { z } from "zod";
import { listPublicVehicles, type PublicVehicle } from "@/lib/catalog.functions";
import { formatKsh } from "@/lib/format";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusBadge } from "@/components/StatusBadge";

export const vehiclesQuery = queryOptions({
  queryKey: ["public-vehicles"],
  queryFn: () => listPublicVehicles(),
});

const searchSchema = z.object({
  q: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  min: z.coerce.number().optional(),
  max: z.coerce.number().optional(),
  loc: z.enum(["yard", "importing"]).optional(),
  ref: z.string().optional(),
});
type Filters = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "VroomLink — Buy cars in Kenya, in the yard or on the ocean" },
      { name: "description", content: "Browse Toyota, Mazda, Subaru and more in Westlands yards or importing via Mombasa Port. Prices in KSh." },
      { property: "og:title", content: "VroomLink — Cars in Kenya" },
      { property: "og:description", content: "Cars in Westlands yards and on the ocean to Mombasa. Book with a deposit." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(vehiclesQuery),
  component: Catalog,
});

export function applyFilters(list: PublicVehicle[], f: Filters) {
  const q = f.q?.toLowerCase().trim();
  return list.filter((v) => {
    if (q && !`${v.make} ${v.model} ${v.year}`.toLowerCase().includes(q)) return false;
    if (f.make && v.make !== f.make) return false;
    if (f.model && v.model !== f.model) return false;
    if (f.min != null && v.price_ksh < f.min) return false;
    if (f.max != null && v.price_ksh > f.max) return false;
    if (f.loc === "yard" && v.status !== "in_yard") return false;
    if (f.loc === "importing" && v.status === "in_yard") return false;
    return true;
  });
}

function Catalog() {
  const { data } = useSuspenseQuery(vehiclesQuery);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const set = (patch: Partial<Filters>) =>
    navigate({ search: (s) => ({ ...s, ...patch }), replace: true });

  const makes = useMemo(() => [...new Set(data.map((v) => v.make))].sort(), [data]);
  const models = useMemo(
    () => [...new Set(data.filter((v) => !search.make || v.make === search.make).map((v) => v.model))].sort(),
    [data, search.make],
  );
  const results = applyFilters(data, search);

  const field = "h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="min-h-screen">
      <SiteHeader q={search.q} onSearch={(q) => set({ q: q || undefined })} />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[260px_1fr]">
        <aside className="h-fit space-y-5 rounded-2xl border bg-card p-5 lg:sticky lg:top-24">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Filters</h2>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Make</label>
            <select className={field} value={search.make ?? ""} onChange={(e) => set({ make: e.target.value || undefined, model: undefined })}>
              <option value="">All makes</option>
              {makes.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Model</label>
            <select className={field} value={search.model ?? ""} onChange={(e) => set({ model: e.target.value || undefined })}>
              <option value="">All models</option>
              {models.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Price range (KSh)</label>
            <div className="flex gap-2">
              <input type="number" placeholder="Min" className={field} defaultValue={search.min}
                onChange={(e) => set({ min: e.target.value ? Number(e.target.value) : undefined })} />
              <input type="number" placeholder="Max" className={field} defaultValue={search.max}
                onChange={(e) => set({ max: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Location status</label>
            <div className="grid gap-2">
              {([[undefined, "All"], ["yard", "In Yard"], ["importing", "Importing"]] as const).map(([val, label]) => (
                <button key={label} onClick={() => set({ loc: val })}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${search.loc === val ? "border-primary bg-accent font-semibold text-accent-foreground" : "hover:bg-muted"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => navigate({ search: {}, replace: true })} className="text-sm font-medium text-primary hover:underline">
            Clear all
          </button>
        </aside>

        <main>
          <div className="mb-5 flex items-baseline justify-between">
            <h1 className="text-2xl font-bold">Available cars</h1>
            <span className="text-sm text-muted-foreground">{results.length} vehicles</span>
          </div>
          {results.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">No cars match these filters.</div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {results.map((v) => (
                <Link key={v.id} to="/cars/$id" params={{ id: v.id }} search={search.ref ? { ref: search.ref } : {}}
                  className="group overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                    <img src={v.images[0]} alt={`${v.year} ${v.make} ${v.model}`} loading="lazy" width={1280} height={832}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    <StatusBadge status={v.status} className="absolute left-3 top-3" />
                  </div>
                  <div className="space-y-1 p-4">
                    <h3 className="font-semibold">{v.year} {v.make} {v.model}</h3>
                    <p className="text-xs text-muted-foreground">
                      {v.mileage_km.toLocaleString()} km · {v.fuel} · {v.transmission}
                    </p>
                    <p className="pt-2 text-lg font-bold text-primary">{formatKsh(v.price_ksh)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
