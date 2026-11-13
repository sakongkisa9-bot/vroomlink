begin;

-- Better Auth core tables. The restricted vroomlink_app role gets no grants on them.
create table "user" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table session (
  id uuid primary key default gen_random_uuid(),
  "expiresAt" timestamptz not null,
  token text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid not null references "user"(id) on delete cascade
);
create index session_user_id_idx on session("userId");

create table account (
  id uuid primary key default gen_random_uuid(),
  "accountId" text not null,
  "providerId" text not null,
  "userId" uuid not null references "user"(id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index account_user_id_idx on account("userId");

create table verification (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index verification_identifier_idx on verification(identifier);

-- Replaces the Supabase user_roles table; seed rows manually with a verified sign-in email.
create table platform_admins (
  email text primary key check (email = lower(btrim(email))),
  created_at timestamptz not null default now()
);

-- Supabase user IDs no longer exist; staff re-link by signing in with Google using their assigned email.
update workers set auth_user_id = null where auth_user_id is not null;

-- Vehicle photos live in Railway PostgreSQL instead of Supabase Storage.
create table vehicle_images (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references dealers(id) on delete cascade,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  data bytea not null check (octet_length(data) between 1 and 10485760),
  created_at timestamptz not null default now()
);
create index vehicle_images_yard_idx on vehicle_images(yard_id);

alter table vehicle_images enable row level security;

create policy vehicle_images_public_read on vehicle_images for select to public
  using (
    is_system_active()
    and (
      yard_role_of(current_vroomlink_user_id(), yard_id) is not null
      or exists (
        select 1
        from cars c
        join dealers d on d.id = c.dealer_id
        where c.dealer_id = vehicle_images.yard_id
          and c.is_published
          and d.is_active
          and d.subscription_status = 'ACTIVE'
          and d.subscription_expires_at > now()
          and ('/api/vehicle-images/' || vehicle_images.id::text) = any(c.images)
          and not exists (
            select 1 from vehicle_sales vs where vs.car_id = c.id
          )
      )
    )
  );
create policy vehicle_images_staff_insert on vehicle_images for insert to public
  with check (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), yard_id)
      in ('OWNER', 'YARD_MANAGER', 'SALESPERSON')
  );
create policy vehicle_images_staff_delete on vehicle_images for delete to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), yard_id)
      in ('OWNER', 'YARD_MANAGER', 'SALESPERSON')
  );

grant select, insert, delete on vehicle_images to vroomlink_app;

commit;
