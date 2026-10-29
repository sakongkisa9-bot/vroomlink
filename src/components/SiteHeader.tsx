import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";

export function SiteHeader({ q, onSearch }: { q?: string | undefined; onSearch?: (q: string) => void }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        <Link to="/" search={{}} className="font-display text-xl font-bold tracking-tight text-foreground">
          Vroom<span className="text-primary">Link</span>
        </Link>
        {onSearch && (
          <label className="relative ml-auto flex w-full max-w-md items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <input
              defaultValue={q}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search make, model, year…"
              className="h-10 w-full rounded-full border bg-card pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        )}
      </div>
    </header>
  );
}
