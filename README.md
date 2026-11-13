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

The public vehicle catalog, booking deposits, authentication, and vehicle photos
all use Railway PostgreSQL; there is no Supabase dependency. Sign-in is handled
by [Better Auth](https://www.better-auth.com) with Google and email/password,
stored in the Railway database and carried in a secure session cookie. Set these
server environment variables (never expose them through a `VITE_` variable):

- `DATABASE_URL`: the Railway PostgreSQL connection string.
- `BETTER_AUTH_URL`: the deployed app origin, for example `https://app.example.com`.
- `BETTER_AUTH_SECRET`: a random string of at least 32 characters.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: a Google OAuth web client whose
  authorized redirect URI is `<BETTER_AUTH_URL>/api/auth/callback/google`.

Staff prove ownership of their assigned email by signing in with Google first;
that verified sign-in links the matching worker record. Afterwards they can add
an email password from the account menu. Public email sign-up is disabled so an
unverified account can never claim a worker's access. Super-admins are the rows
in `platform_admins`; add one with a verified sign-in email, for example
`insert into platform_admins (email) values ('you@example.com');`.

For Railway, build with `npm run build` and start with `npm start`. The start
script uses Railway's injected `PORT`; it defaults to port `8080` for local or
container environments that do not provide one. Vehicle photos are stored in the
`vehicle_images` table and served from `/api/vehicle-images/<id>`.

The initial Railway schema and demo catalog are in
[`railway/migrations/0001_vroomlink.sql`](./railway/migrations/0001_vroomlink.sql).
Review the migration and back up the target database before applying it. With
the project dependencies installed and `DATABASE_URL` set in `.env`, apply
migrations from PowerShell with:

```powershell
npm run db:migrate -- 0001_vroomlink.sql
npm run db:migrate -- 0002_link_authenticated_workers.sql
npm run db:migrate -- 0003_broker_sales.sql
npm run db:migrate -- 0004_super_admin_dealer_provisioning.sql
npm run db:migrate -- 0005_dealer_availability.sql
npm run db:migrate -- 0006_developer_yard_deletion.sql
npm run db:migrate -- 0007_add_broker_workspace_role.sql
npm run db:migrate -- 0008_separate_broker_and_salesperson_roles.sql
npm run db:migrate -- 0009_vehicle_details.sql
npm run db:migrate -- 0010_railway_auth_and_images.sql
```

The migration runner executes the checked-in SQL file using the project's
PostgreSQL driver, so `psql` is not required. Do not paste `DATABASE_URL` into
chat or commit `.env` to Git.

The migration creates a restricted `vroomlink_app` role and grants it to the
database user that applies the migration. The server switches each pooled
connection to that role, so run the migration with the same login configured in
the server's `DATABASE_URL`. Do not expose `DATABASE_URL` through a `VITE_`
variable or client-side code.

The seeded vehicle rows preserve the current demo catalog only. Existing live
Supabase inventory, memberships, and subscription data are not copied by these
migrations and must be exported and imported before switching production
traffic to Railway. Migration `0010` clears every worker's old Supabase user ID;
each worker re-links by signing in with Google using the email on their worker
record, and Supabase passwords cannot be transferred, so workers set a new
password after that first sign-in. The linking operation cannot change an
existing user mapping; admins must provision the worker row with the matching
email before the worker signs in.

Existing listing photos hosted by Supabase are not copied by migration `0010`.
Before removing Supabase storage, export those images and re-upload them through
the vehicle editor, then remove the old photo URLs from each listing.

The broker and sales workflow is added by `0003_broker_sales.sql`. Apply it
after the first two migrations. It creates private per-vehicle wholesale and
commission terms, salesperson-owned leads, and completed vehicle sales. New
vehicle imports require a wholesale price and commission rate; existing
vehicles are not assigned invented trade terms and must have terms provisioned
before they appear in broker inventory. A broker commission is recorded only
when an authorized yard owner or salesperson records a completed sale, and the
database calculates it from the final sale price and the vehicle's configured
rate. Public catalog queries do not read trade-pricing records. Railway's
dealer UUID is also exposed as the tenant `yard_id`, and role checks in the
migration use security-definer `yard_role_of()` and `has_role()` helpers.
Migration `0004_super_admin_dealer_provisioning.sql` grants the application
role permission to create dealer and owner records only after the backend has
verified a super-admin from `platform_admins`. The developer panel uses this flow and
does not rely on a hardcoded client-side password.
Migration `0005_dealer_availability.sql` adds developer-controlled per-yard
shutdowns. A shut-down yard is blocked from worker access and its listings and
booking deposits are unavailable until a super-admin restores it. The Developer
Panel displays the yard's registered staff names, roles, sign-in emails, and
whether each email has been linked to a sign-in; passwords are never
available to the application.

The public home page lists active yards; each yard's public catalog is available
at `/yard/<slug>`. Yard QR codes link directly to that catalog. Migration
`0007_add_broker_workspace_role.sql` must be applied before
`0008_separate_broker_and_salesperson_roles.sql`: the latter moves existing
salesperson-role accounts to the broker workspace and existing yard managers to
the salesperson workspace. Yard owners manage staff and oversee the yard,
salespeople manage inventory and record sales, and brokers use the referral
workspace.

Dealer subscriptions are marked expired on app transactions after their expiry
time. For expiry processing independent of traffic, configure a Railway scheduled
job to run `select expire_dealer_subscriptions();` periodically. Subscription
payment recording accepts normalized Stripe/M-Pesa event data through an
authenticated super-admin server function; provider callback URLs and signature
verification still need to be added before enabling live webhooks.
