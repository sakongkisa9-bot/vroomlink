import { Link } from "@tanstack/react-router";
import { ChevronDown, Search } from "lucide-react";
import { InstallAppButton } from "@/components/InstallAppButton";
import { PortalAuthControl } from "@/components/PortalAuthControl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SiteHeader({
  q,
  onSearch,
}: {
  q?: string | undefined;
  onSearch?: (q: string) => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-2 px-4 py-2 sm:h-16 sm:flex-nowrap sm:gap-4 sm:py-0">
        <Link
          to="/"
          search={{}}
          className="font-display text-xl font-bold tracking-tight text-foreground"
        >
          Vroom<span className="text-primary">Link</span>
        </Link>
        {onSearch && (
          <label className="relative order-last flex w-full basis-full items-center sm:order-none sm:ml-auto sm:w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <input
              defaultValue={q}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search make, model, year…"
              className="h-10 w-full rounded-full border bg-card pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
          <InstallAppButton />
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Portal Access"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border bg-card px-3 text-sm font-semibold shadow-sm outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring sm:px-4"
            >
              <span className="hidden sm:inline">Portal Access</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>VroomLink Portals</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/broker">Broker Dashboard</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/salesperson">Salesperson Workspace</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/dealer">Car Dealer Console</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/developer">Developer Admin Panel</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <PortalAuthControl />
        </div>
      </div>
    </header>
  );
}
