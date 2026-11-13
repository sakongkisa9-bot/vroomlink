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

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });

  return betterAuth({
    appName: "VroomLink",
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    database: pool,
    // Accounts come from Google sign-in or an owner-issued temporary password, never public sign-up.
    emailAndPassword: { enabled: true, disableSignUp: true },
    socialProviders:
      googleClientId && googleClientSecret
        ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
        : {},
    user: {
      additionalFields: {
        mustChangePassword: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
      },
    },
    databaseHooks: {
      account: {
        create: {
          // Google proves mailbox ownership, so an owner-set temporary password must stop working.
          after: async (account) => {
            if (account.providerId === "credential") return;
            await pool.query(
              `delete from account
               where "userId" = $1::uuid and "providerId" = 'credential'
                 and exists (select 1 from "user" where id = $1::uuid and "mustChangePassword")`,
              [account.userId],
            );
            await pool.query(
              `update "user" set "mustChangePassword" = false where id = $1::uuid`,
              [account.userId],
            );
          },
        },
      },
    },
    advanced: { database: { generateId: "uuid" } },
  });
}

let authInstance: ReturnType<typeof createAuth> | undefined;

export function getRailwayAuth() {
  authInstance ??= createAuth();
  return authInstance;
}