import { createMiddleware } from "@tanstack/react-start";
import { requireRailwaySystemActive } from "@/lib/railway.server";

export const requireRailwaySystemActiveMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  await requireRailwaySystemActive();
  return next();
});
