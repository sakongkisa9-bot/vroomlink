import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getRailwayAuth } from "./railway-auth.server";

export const requireRailwayAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    if (!request)
      throw new Error("Unauthorized: request context is unavailable.");

    const session = await getRailwayAuth().api.getSession({
      headers: request.headers,
    });
    if (!session)
      throw new Error("Unauthorized: sign in to continue.");

    return next({
      context: {
        userId: session.user.id,
        claims: { email: session.user.email },
        emailVerified: session.user.emailVerified,
      },
    });
  },
);