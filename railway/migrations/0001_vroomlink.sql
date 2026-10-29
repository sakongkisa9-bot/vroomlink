begin;

create extension if not exists pgcrypto;

create type subscription_status as enum ('ACTIVE', 'EXPIRED');
create type workspace_role as enum ('OWNER', 'YARD_MANAGER', 'SALESPERSON');
create type car_status_badge as enum ('PURCHASED', 'ON_OCEAN', 'PORT_CLEARING', 'IN_YARD');
create type subscription_provider as enum ('stripe', 'mpesa');

create role vroomlink_app nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant vroomlink_app to current_user;

create table dealers (
  id uuid primary key default gen_random_uuid(),
  showroom_name text not null,
  location text not null,
  subscription_status subscription_status not null default 'ACTIVE',
  subscription_expires_at timestamptz not null,
  slug text not null unique,
  whatsapp_phone text not null default '254700000000',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workers (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references dealers(id) on delete cascade,
  auth_user_id uuid,
  full_name text not null,
  email text not null,
  workspace_role workspace_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (dealer_id, email),
  unique (dealer_id, auth_user_id)
);

create table cars (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references dealers(id) on delete cascade,
  brand text not null,
  model text not null,
  chassis_number text,
  selling_price bigint not null check (selling_price > 0),
  status_badge car_status_badge not null default 'PURCHASED',
  year integer not null check (year between 1900 and 2100),
  mileage_km integer not null default 0 check (mileage_km >= 0),
  engine_cc integer check (engine_cc is null or engine_cc > 0),
  transmission text not null default 'Automatic',
  fuel text not null default 'Petrol',
  color text,
  body_type text,
  drive text,
  booking_deposit_ksh bigint not null default 100000 check (booking_deposit_ksh >= 0),
  eta_date date,
  images text[] not null default '{}',
  description text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealer_id, chassis_number),
  unique (id, dealer_id)
);

create table import_costs (
  car_id uuid primary key,
  dealer_id uuid not null references dealers(id) on delete cascade,
  cif_purchase_price bigint not null check (cif_purchase_price >= 0),
  kra_import_duty bigint not null check (kra_import_duty >= 0),
  port_clearance_fees bigint not null check (port_clearance_fees >= 0),
  flatbed_transport bigint not null check (flatbed_transport >= 0),
  total_true_cost bigint generated always as (
    cif_purchase_price + kra_import_duty + port_clearance_fees + flatbed_transport
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table import_costs add constraint import_costs_car_dealer_fk
  foreign key (car_id, dealer_id) references cars(id, dealer_id) on delete cascade;

create table system_logs (
  id bigint generated always as identity primary key,
  dealer_id uuid,
  worker_email text not null,
  action_performed text not null,
  record_id text not null,
  "timestamp" timestamptz not null default now()
);

create table global_settings (
  id integer primary key default 1 check (id = 1),
  is_system_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into global_settings (id, is_system_active) values (1, true);

create table booking_deposits (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null,
  dealer_id uuid not null references dealers(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  referral_broker_id uuid,
  amount_ksh bigint not null check (amount_ksh >= 0),
  status text not null default 'simulated_paid',
  created_at timestamptz not null default now(),
  foreign key (vehicle_id, dealer_id) references cars(id, dealer_id)
);

create table subscription_events (
  id uuid primary key default gen_random_uuid(),
  provider subscription_provider not null,
  provider_event_id text not null,
  dealer_id uuid not null references dealers(id) on delete cascade,
  amount_ksh bigint not null check (amount_ksh > 0),
  paid_at timestamptz not null,
  subscription_expires_at timestamptz not null,
  provider_reference text not null,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index workers_auth_user_idx on workers(auth_user_id) where auth_user_id is not null;
create index cars_public_catalog_idx on cars(created_at desc) where is_published;
create index cars_dealer_idx on cars(dealer_id);
create index dealers_subscription_expiry_idx on dealers(subscription_expires_at)
  where subscription_status = 'ACTIVE';
create index system_logs_dealer_timestamp_idx on system_logs(dealer_id, "timestamp" desc);

create function current_vroomlink_user_id()
returns uuid
language sql stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create function current_vroomlink_role(target_dealer_id uuid)
returns workspace_role
language sql stable security definer
set search_path = public, pg_temp
as $$
  select w.workspace_role
  from workers w
  join dealers d on d.id = w.dealer_id
  where w.dealer_id = target_dealer_id
    and w.auth_user_id = current_vroomlink_user_id()
    and w.is_active
    and d.subscription_status = 'ACTIVE'
    and d.subscription_expires_at > now()
  limit 1
$$;

create function is_system_active()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select gs.is_system_active from global_settings gs where gs.id = 1), false)
$$;

create function expire_dealer_subscriptions()
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare expired_count integer;
begin
  update dealers
  set subscription_status = 'EXPIRED', updated_at = now()
  where subscription_status = 'ACTIVE' and subscription_expires_at <= now();
  get diagnostics expired_count = row_count;
  return expired_count;
end
$$;

create function write_system_log()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  entry jsonb;
  dealer_key uuid;
  record_key text;
  actor_email text;
begin
  if tg_op = 'DELETE' then
    entry := to_jsonb(old);
  else
    entry := to_jsonb(new);
  end if;

  dealer_key := nullif(entry ->> 'dealer_id', '')::uuid;
  record_key := coalesce(entry ->> 'id', entry ->> 'car_id', entry ->> 'vehicle_id', 'global');
  actor_email := coalesce(nullif(current_setting('app.worker_email', true), ''), 'system');

  insert into system_logs (dealer_id, worker_email, action_performed, record_id)
  values (dealer_key, actor_email, tg_op || ':' || tg_table_name, record_key);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

create function reject_system_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'System logs are immutable';
end
$$;

create trigger dealers_system_log
  after insert or update or delete on dealers
  for each row execute function write_system_log();
create trigger workers_system_log
  after insert or update or delete on workers
  for each row execute function write_system_log();
create trigger cars_system_log
  after insert or update or delete on cars
  for each row execute function write_system_log();
create trigger import_costs_system_log
  after insert or update or delete on import_costs
  for each row execute function write_system_log();
create trigger global_settings_system_log
  after insert or update or delete on global_settings
  for each row execute function write_system_log();
create trigger booking_deposits_system_log
  after insert or update or delete on booking_deposits
  for each row execute function write_system_log();
create trigger subscription_events_system_log
  after insert or update or delete on subscription_events
  for each row execute function write_system_log();
create trigger system_logs_immutable
  before update or delete on system_logs
  for each row execute function reject_system_log_mutation();

alter table dealers enable row level security;
alter table workers enable row level security;
alter table cars enable row level security;
alter table import_costs enable row level security;
alter table system_logs enable row level security;
alter table global_settings enable row level security;
alter table booking_deposits enable row level security;
alter table subscription_events enable row level security;

create policy global_settings_read on global_settings for select to public using (true);
create policy global_settings_super_admin_update on global_settings for update to public
  using (current_setting('app.is_super_admin', true) = 'true')
  with check (current_setting('app.is_super_admin', true) = 'true');

create policy dealers_public_read on dealers for select to public
  using (
    is_system_active()
    and (
      (subscription_status = 'ACTIVE' and subscription_expires_at > now())
      or current_vroomlink_role(id) is not null
    )
  );
create policy dealers_admin_read on dealers for select to public
  using (is_system_active() and current_setting('app.is_super_admin', true) = 'true');
create policy dealers_owner_update on dealers for update to public
  using (is_system_active() and current_vroomlink_role(id) = 'OWNER')
  with check (is_system_active() and current_vroomlink_role(id) = 'OWNER');
create policy dealers_admin_update on dealers for update to public
  using (is_system_active() and current_setting('app.is_super_admin', true) = 'true')
  with check (is_system_active() and current_setting('app.is_super_admin', true) = 'true');

create policy workers_member_read on workers for select to public
  using (
    is_system_active()
    and (
      auth_user_id = current_vroomlink_user_id()
      or current_vroomlink_role(dealer_id) in ('OWNER', 'YARD_MANAGER')
    )
  );
create policy workers_owner_manage on workers for all to public
  using (is_system_active() and current_vroomlink_role(dealer_id) = 'OWNER')
  with check (is_system_active() and current_vroomlink_role(dealer_id) = 'OWNER');

create policy cars_public_read on cars for select to public
  using (
    is_system_active()
    and (
      (
        is_published
        and exists (
          select 1 from dealers d
          where d.id = cars.dealer_id
            and d.subscription_status = 'ACTIVE'
            and d.subscription_expires_at > now()
        )
      )
      or current_vroomlink_role(dealer_id) is not null
    )
  );
create policy cars_staff_manage on cars for all to public
  using (is_system_active() and current_vroomlink_role(dealer_id) in ('OWNER', 'YARD_MANAGER'))
  with check (is_system_active() and current_vroomlink_role(dealer_id) in ('OWNER', 'YARD_MANAGER'));

create policy import_costs_staff_read on import_costs for select to public
  using (
    is_system_active()
    and current_vroomlink_role(dealer_id) in ('OWNER', 'YARD_MANAGER')
  );
create policy import_costs_staff_manage on import_costs for all to public
  using (
    is_system_active()
    and current_vroomlink_role(dealer_id) in ('OWNER', 'YARD_MANAGER')
  )
  with check (
    is_system_active()
    and current_vroomlink_role(dealer_id) in ('OWNER', 'YARD_MANAGER')
  );

create policy system_logs_owner_read on system_logs for select to public
  using (
    is_system_active()
    and (
      current_setting('app.is_super_admin', true) = 'true'
      or (dealer_id is not null and current_vroomlink_role(dealer_id) = 'OWNER')
    )
  );

create policy booking_deposits_public_create on booking_deposits for insert to public
  with check (
    is_system_active()
    and exists (
      select 1 from cars c
      join dealers d on d.id = c.dealer_id
      where c.id = booking_deposits.vehicle_id
        and c.dealer_id = booking_deposits.dealer_id
        and c.is_published
        and d.subscription_status = 'ACTIVE'
        and d.subscription_expires_at > now()
        and booking_deposits.amount_ksh = c.booking_deposit_ksh
    )
  );
create policy booking_deposits_staff_read on booking_deposits for select to public
  using (
    is_system_active()
    and exists (
      select 1 from cars c
      where c.id = booking_deposits.vehicle_id
        and c.dealer_id = booking_deposits.dealer_id
        and current_vroomlink_role(booking_deposits.dealer_id) in ('OWNER', 'YARD_MANAGER')
    )
  );
create policy booking_deposits_insert_return on booking_deposits for select to public
  using (
    is_system_active()
    and current_setting('app.booking_deposit_return', true) = 'true'
  );

create policy subscription_events_admin_read on subscription_events for select to public
  using (is_system_active() and current_setting('app.is_super_admin', true) = 'true');
create policy subscription_events_admin_insert on subscription_events for insert to public
  with check (is_system_active() and current_setting('app.is_super_admin', true) = 'true');

revoke insert, update, delete, truncate on system_logs from public;
revoke update, delete, truncate on system_logs from public;
revoke update, delete on subscription_events from public;
revoke update, delete on booking_deposits from public;

grant usage on type subscription_status, workspace_role, car_status_badge, subscription_provider to vroomlink_app;
grant usage on schema public to vroomlink_app;
grant select on dealers, workers, cars, import_costs, system_logs, global_settings, booking_deposits, subscription_events to vroomlink_app;
grant update on dealers, workers, cars, import_costs, global_settings to vroomlink_app;
grant insert on cars, import_costs, booking_deposits, subscription_events to vroomlink_app;

insert into dealers (
  id, showroom_name, location, subscription_status, subscription_expires_at, slug, whatsapp_phone
) values
  ('11111111-1111-1111-1111-111111111111', 'Westlands Prime Motors', 'Westlands, Nairobi', 'ACTIVE', now() + interval '30 days', 'westlands-prime', '254712345678'),
  ('22222222-2222-2222-2222-222222222222', 'Coastline Auto Imports', 'Nyali, Mombasa', 'ACTIVE', now() + interval '30 days', 'coastline-auto', '254722345678');

insert into cars (
  dealer_id, brand, model, year, mileage_km, engine_cc, transmission, fuel, color,
  body_type, drive, selling_price, booking_deposit_ksh, status_badge, eta_date,
  images, description
) values
  ('11111111-1111-1111-1111-111111111111', 'Toyota', 'Land Cruiser Prado TX', 2019, 48000, 2800, 'Automatic', 'Diesel', 'Pearl White', 'SUV', '4WD', 7850000, 250000, 'IN_YARD', null, '{/cars/prado.jpg,/cars/interior.jpg}', 'Clean TX-L package, sunroof, leather, 7 seats.'),
  ('11111111-1111-1111-1111-111111111111', 'Mazda', 'CX-5', 2018, 62000, 2200, 'Automatic', 'Diesel', 'Soul Red', 'SUV', 'AWD', 3450000, 100000, 'IN_YARD', null, '{/cars/cx5.jpg,/cars/interior.jpg}', 'Diesel AWD, Bose sound, accident-free.'),
  ('11111111-1111-1111-1111-111111111111', 'Subaru', 'Forester XT', 2017, 71000, 2000, 'Automatic', 'Petrol', 'Ice Silver', 'SUV', 'AWD', 2950000, 100000, 'ON_OCEAN', '2026-11-20', '{/cars/forester.jpg,/cars/interior.jpg}', 'Turbo XT, EyeSight, arriving Mombasa soon.'),
  ('11111111-1111-1111-1111-111111111111', 'Toyota', 'Harrier', 2020, 39000, 2000, 'Automatic', 'Petrol', 'Jet Black', 'SUV', '2WD', 5200000, 200000, 'ON_OCEAN', '2026-11-28', '{/cars/harrier.jpg,/cars/interior.jpg}', 'New shape Harrier, panoramic roof.'),
  ('22222222-2222-2222-2222-222222222222', 'Toyota', 'Land Cruiser Prado TX', 2018, 66000, 2700, 'Automatic', 'Petrol', 'Black', 'SUV', '4WD', 6900000, 250000, 'PORT_CLEARING', '2026-11-05', '{/cars/prado.jpg,/cars/interior.jpg}', 'Clearing at Mombasa Port this week.'),
  ('22222222-2222-2222-2222-222222222222', 'Mazda', 'CX-5', 2019, 51000, 2500, 'Automatic', 'Petrol', 'Machine Grey', 'SUV', '2WD', 3650000, 100000, 'IN_YARD', null, '{/cars/cx5.jpg,/cars/interior.jpg}', 'Low mileage, full service history.'),
  ('22222222-2222-2222-2222-222222222222', 'Subaru', 'Forester', 2019, 44000, 2000, 'Automatic', 'Petrol', 'Blue', 'SUV', 'AWD', 3300000, 100000, 'IN_YARD', null, '{/cars/forester.jpg,/cars/interior.jpg}', 'Non-turbo, economical daily driver.'),
  ('22222222-2222-2222-2222-222222222222', 'Toyota', 'Harrier', 2019, 58000, 2000, 'Automatic', 'Petrol', 'Pearl White', 'SUV', '2WD', 4600000, 150000, 'PURCHASED', '2026-12-15', '{/cars/harrier.jpg,/cars/interior.jpg}', 'Just bought at auction in Japan.');

commit;
