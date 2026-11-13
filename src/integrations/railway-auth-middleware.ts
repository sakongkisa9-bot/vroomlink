import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getRailwayAuth } from "./railway-auth.server";

function createAuthMiddleware(allowTemporaryPassword: boolean) {
  return createMiddleware({ type: "function" }).server(async ({ next }) => {
    const request = getRequest();
    if (!request)
      throw new Error("Unauthorized: request context is unavailable.");

    const session = await getRailwayAuth().api.getSession({
      headers: request.headers,
    });
    if (!session) throw new Error("Unauthorized: sign in to continue.");

    const mustChangePassword =
      (session.user as { mustChangePassword?: boolean }).mustChangePassword ===
      true;
    if (mustChangePassword && !allowTemporaryPassword)
      throw new Error("Change your temporary password to continue.");

    return next({
      context: {
        userId: session.user.id,
        claims: { email: session.user.email },
        emailVerified: session.user.emailVerified,
        mustChangePassword,
      },
    });
  });
}

export const requireRailwayAuth = createAuthMiddleware(false);
// Only for endpoints a signed-in worker needs before replacing a temporary password.
export const requireRailwayAuthAllowingTemporaryPassword =
  createAuthMiddleware(true);