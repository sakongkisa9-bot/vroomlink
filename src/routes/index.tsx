import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listPublicYards } from "@/lib/catalog.functions";
import { applyFilters } from "@/lib/catalog-filters";
import { SiteHeader } from "@/components/SiteHeader";

const yardsQuery = queryOptions({
  queryKey: ["public-yards"],
  queryFn: () => listPublicYards(),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Choose a Car Yard | VroomLink" },
      {
        name: "description",
        content:
          "Choose a car yard to browse its own vehicle marketplace on VroomLink.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(yardsQuery),
  component: YardDirectory,
});

function YardDirectory() {
  const { data: yards } = useSuspenseQuery(yardsQuery);
  const [query, setQuery] = useState("");
  const visibleYards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return yards.filter(
      (yard) =>
        !normalizedQuery ||
        `${yard.name} ${yard.location}`.toLowerCase().includes(normalizedQuery),
    );
  }, [query, yards]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            VroomLink Marketplace
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Which car yard would you like to visit?
          </h1>
          <p className="mt-3 text-muted-foreground">
            Each yard has its own vehicle listings and marketplace.
          </p>
          <label className="mt-6 block">
            <span className="sr-only">Search car yards</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by yard name or location"
              className="h-12 w-full rounded-xl border bg-card px-4 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>

        <section
          aria-label="Available car yards"
          className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {visibleYards.map((yard) => (
            <Link
              key={yard.slug}
              to="/yard/$slug"
              params={{ slug: yard.slug }}
              className="group rounded-2xl border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold group-hover:text-primary">
                    {yard.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {yard.location}
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {yard.vehicle_count} cars
                </span>
              </div>
              <p className="mt-6 text-sm font-semibold text-primary">
                Open this yard&apos;s marketplace →
              </p>
            </Link>
          ))}
          {visibleYards.length === 0 && (
            <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
              {yards.length === 0
                ? "No car yards are currently available."
                : "No car yards match your search."}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
