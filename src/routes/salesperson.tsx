import { createFileRoute } from "@tanstack/react-router";
import { DealerWorkspace } from "./dealer";

export const Route = createFileRoute("/salesperson")({
  head: () => ({ meta: [{ title: "Salesperson Workspace | VroomLink" }] }),
  component: () => <DealerWorkspace expectedRole="SALESPERSON" />,
});
