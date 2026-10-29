# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Railway PostgreSQL

The public vehicle catalog and booking-deposit flow use Railway PostgreSQL. Supabase
Auth remains the identity provider for protected server functions. Configure
`DATABASE_URL` only in the server environment; keep the existing Supabase URL and
publishable-key variables configured for authentication.

The initial Railway schema and demo catalog are in
[`railway/migrations/0001_vroomlink.sql`](./railway/migrations/0001_vroomlink.sql).
Review the migration and back up the target database before applying it. From
PowerShell, apply it with:

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f railway\migrations\0001_vroomlink.sql
```

The migration creates a restricted `vroomlink_app` role and grants it to the
database user that applies the migration. The server switches each pooled
connection to that role, so run the migration with the same login configured in
the server's `DATABASE_URL`. Do not expose `DATABASE_URL` through a `VITE_`
variable or client-side code.

The seeded vehicle rows preserve the current demo catalog only. Existing live
Supabase inventory, memberships, and subscription data are not copied by this
schema migration and must be exported and imported before switching production
traffic to Railway. Worker records must also be linked to Supabase user IDs in
`workers.auth_user_id` before protected dealer operations can be used.

Dealer subscriptions are marked expired on app transactions after their expiry
time. For expiry processing independent of traffic, configure a Railway scheduled
job to run `select expire_dealer_subscriptions();` periodically. Subscription
payment recording accepts normalized Stripe/M-Pesa event data through an
authenticated super-admin server function; provider callback URLs and signature
verification still need to be added before enabling live webhooks.
