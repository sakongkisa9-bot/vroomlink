import { betterAuth } from "better-auth";
import { Pool } from "pg";

function createAuth() {
  const databaseUrl = process.env["DATABASE_URL"];
  const secret = process.env["BETTER_AUTH_SECRET"];
  const baseURL = process.env["BETTER_AUTH_URL"];
  if (!databaseUrl) throw new Error("Missing DATABASE_URL for Railway auth.");
  if (!secret || secret.length < 32)
    throw new Error("Set BETTER_AUTH_SECRET to a random value of at least 32 characters.");
  if (!baseURL) throw new Error("Set BETTER_AUTH_URL to the deployed app origin.");

  const googleClientId = process.env["GOOGLE_CLIENT_ID"];
  const googleClientSecret = process.env["GOOGLE_CLIENT_SECRET"];

  return betterAuth({
    appName: "VroomLink",
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    database: new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
      max: 5,
    }),
    // Accounts are created by Google sign-in; passwords are added afterwards via setPassword.
    emailAndPassword: { enabled: true, disableSignUp: true },
    socialProviders:
      googleClientId && googleClientSecret
        ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
        : {},
    advanced: { database: { generateId: "uuid" } },
  });
}

let authInstance: ReturnType<typeof createAuth> | undefined;

export function getRailwayAuth() {
  authInstance ??= createAuth();
  return authInstance;
}