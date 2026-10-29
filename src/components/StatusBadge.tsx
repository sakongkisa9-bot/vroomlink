import { STATUS_LABEL, isInYard } from "@/lib/format";
import type { VehicleStatus } from "@/lib/catalog.functions";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: VehicleStatus; className?: string | undefined }) {
  const yard = isInYard(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-sm",
        yard ? "bg-yard text-yard-foreground" : "bg-ocean text-ocean-foreground",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {STATUS_LABEL[status]}
    </span>
  );
}
