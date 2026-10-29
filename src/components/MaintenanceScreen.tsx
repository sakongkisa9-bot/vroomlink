import { Link } from "@tanstack/react-router";

export function MaintenanceScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-maintenance px-6">
      <div className="max-w-lg text-center">
        <p className="text-xl font-medium text-muted-foreground">
          System Under Emergency Maintenance. Please contact administration.
        </p>
        <Link
          to="/developer"
          className="mt-4 inline-block text-sm font-medium text-muted-foreground underline underline-offset-4"
        >
          Developer control panel
        </Link>
      </div>
    </div>
  );
}
