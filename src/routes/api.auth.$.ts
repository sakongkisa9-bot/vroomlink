import { createFileRoute } from "@tanstack/react-router";
import { getRailwayAuth } from "@/integrations/railway-auth.server";

async function handleAuthRequest({ request }: { request: Request }) {
  const url = new URL(request.url);
  if (url.pathname === "/api/auth/sign-up/email") {
    return Response.json(
      { message: "Sign in with Google before adding an email password." },
      { status: 403 },
    );
  }

  return getRailwayAuth().handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: handleAuthRequest,
      POST: handleAuthRequest,
    },
  },
});