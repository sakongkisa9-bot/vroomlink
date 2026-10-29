
create type public.app_role as enum ('super_admin');
create type public.yard_role as enum ('owner', 'manager', 'broker');
create type public.vehicle_status as enum ('purchased_japan', 'on_ocean', 'port_clearing', 'in_yard');

create table public.system_settings (
  id int primary key default 1 check (id = 1),
  is_system_active boolean not null default true,
  updated_at timestamptz not null default now()
);
grant select on public.system_settings to anon, authenticated;
grant all on public.system_settings to service_role;
alter table public.system_settings enable row level security;
create policy "Anyone can read system status" on public.system_settings for select to anon, authenticated using (true);
insert into public.system_settings (id, is_system_active) values (1, true);

create or replace function public.is_system_active()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select is_system_active from public.system_settings where id = 1), true) $$;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "Users read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "Super admins update system status" on public.system_settings for update to authenticated
  using (public.has_role(auth.uid(), 'super_admin')) with check (public.has_role(auth.uid(), 'super_admin'));
grant update on public.system_settings to authenticated;

create table public.yards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  location text not null default 'Westlands, Nairobi',
  whatsapp_phone text not null default '254700000000',
  subscription_expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);
grant select on public.yards to anon, authenticated;
grant insert, update, delete on public.yards to authenticated;
grant all on public.yards to service_role;
alter table public.yards enable row level security;
create policy "Public can view yards" on public.yards for select to anon, authenticated using (public.is_system_active());

create table public.yard_members (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete cascade,
  user_id uuid,
  email text not null,
  role public.yard_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (yard_id, email)
);
grant select, insert, update, delete on public.yard_members to authenticated;
grant all on public.yard_members to service_role;
alter table public.yard_members enable row level security;

create or replace function public.yard_role_of(_user_id uuid, _yard_id uuid)
returns public.yard_role language sql stable security definer set search_path = public
as $$ select role from public.yard_members where user_id = _user_id and yard_id = _yard_id and is_active limit 1 $$;

create policy "Members see own membership; owners see yard" on public.yard_members for select to authenticated
  using (public.is_system_active() and (user_id = auth.uid() or public.yard_role_of(auth.uid(), yard_id) = 'owner'));
create policy "Owners manage members" on public.yard_members for all to authenticated
  using (public.is_system_active() and public.yard_role_of(auth.uid(), yard_id) = 'owner')
  with check (public.is_system_active() and public.yard_role_of(auth.uid(), yard_id) = 'owner');

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete cascade,
  make text not null,
  model text not null,
  year int not null,
  mileage_km int not null default 0,
  engine_cc int,
  transmission text not null default 'Automatic',
  fuel text not null default 'Petrol',
  color text,
  body_type text,
  drive text,
  price_ksh bigint not null,
  booking_deposit_ksh bigint not null default 100000,
  status public.vehicle_status not null default 'purchased_japan',
  eta_date date,
  images text[] not null default '{}',
  description text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.vehicles to anon;
grant select, insert, update, delete on public.vehicles to authenticated;
grant all on public.vehicles to service_role;
alter table public.vehicles enable row level security;
create policy "Public views published vehicles" on public.vehicles for select to anon, authenticated
  using (public.is_system_active() and is_published);
create policy "Yard staff view all yard vehicles" on public.vehicles for select to authenticated
  using (public.is_system_active() and public.yard_role_of(auth.uid(), yard_id) is not null);
create policy "Yard staff manage vehicles" on public.vehicles for all to authenticated
  using (public.is_system_active() and public.yard_role_of(auth.uid(), yard_id) in ('owner','manager'))
  with check (public.is_system_active() and public.yard_role_of(auth.uid(), yard_id) in ('owner','manager'));

create table public.vehicle_trade_pricing (
  vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
  yard_id uuid not null references public.yards(id) on delete cascade,
  wholesale_price_ksh bigint not null,
  broker_commission_ksh bigint not null,
  cif_price_ksh bigint not null default 0,
  kra_duty_ksh bigint not null default 0,
  port_fees_ksh bigint not null default 0,
  transport_ksh bigint not null default 0
);
grant select, insert, update, delete on public.vehicle_trade_pricing to authenticated;
grant all on public.vehicle_trade_pricing to service_role;
alter table public.vehicle_trade_pricing enable row level security;
create policy "Yard members view trade pricing" on public.vehicle_trade_pricing for select to authenticated
  using (public.is_system_active() and public.yard_role_of(auth.uid(), yard_id) is not null);
create policy "Managers manage trade pricing" on public.vehicle_trade_pricing for all to authenticated
  using (public.is_system_active() and public.yard_role_of(auth.uid(), yard_id) in ('owner','manager'))
  with check (public.is_system_active() and public.yard_role_of(auth.uid(), yard_id) in ('owner','manager'));

create table public.audit_logs (
  id bigint generated always as identity primary key,
  yard_id uuid,
  actor_id uuid,
  actor_email text,
  action text not null,
  table_name text not null,
  record_id text not null,
  created_at timestamptz not null default now()
);
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "Owners read yard audit logs" on public.audit_logs for select to authenticated
  using (public.yard_role_of(auth.uid(), yard_id) = 'owner' or public.has_role(auth.uid(), 'super_admin'));

create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = public
as $$
declare j jsonb;
begin
  if tg_op = 'DELETE' then j := to_jsonb(old); else j := to_jsonb(new); end if;
  insert into public.audit_logs (yard_id, actor_id, actor_email, action, table_name, record_id)
  values ((j->>'yard_id')::uuid, auth.uid(), coalesce(auth.jwt() ->> 'email', 'system'), tg_op, tg_table_name,
          coalesce(j->>'id', j->>'vehicle_id'));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger audit_vehicles after insert or update or delete on public.vehicles for each row execute function public.write_audit_log();
create trigger audit_pricing after insert or update or delete on public.vehicle_trade_pricing for each row execute function public.write_audit_log();
create trigger audit_members after insert or update or delete on public.yard_members for each row execute function public.write_audit_log();

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references public.yards(id) on delete cascade,
  broker_id uuid not null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  client_name text not null,
  client_phone text not null,
  status text not null default 'active',
  commission_earned_ksh bigint not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.leads to authenticated;
grant all on public.leads to service_role;
alter table public.leads enable row level security;
create policy "Brokers see own leads, owners/managers see yard" on public.leads for select to authenticated
  using (public.is_system_active() and (broker_id = auth.uid() or public.yard_role_of(auth.uid(), yard_id) in ('owner','manager')));
create policy "Brokers submit leads" on public.leads for insert to authenticated
  with check (public.is_system_active() and broker_id = auth.uid() and public.yard_role_of(auth.uid(), yard_id) is not null);

create table public.booking_deposits (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  amount_ksh bigint not null,
  referral_broker_id uuid,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
grant all on public.booking_deposits to service_role;
alter table public.booking_deposits enable row level security;

create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid references public.yards(id) on delete set null,
  provider text not null,
  reference text not null,
  amount_ksh bigint not null,
  status text not null,
  raw jsonb,
  created_at timestamptz not null default now()
);
grant select on public.subscription_events to authenticated;
grant all on public.subscription_events to service_role;
alter table public.subscription_events enable row level security;
create policy "Super admins read events" on public.subscription_events for select to authenticated using (public.has_role(auth.uid(), 'super_admin'));

insert into public.yards (id, name, slug, location, whatsapp_phone) values
 ('11111111-1111-1111-1111-111111111111', 'Westlands Prime Motors', 'westlands-prime', 'Westlands, Nairobi', '254712345678'),
 ('22222222-2222-2222-2222-222222222222', 'Coastline Auto Imports', 'coastline-auto', 'Nyali, Mombasa', '254722345678');

insert into public.vehicles (yard_id, make, model, year, mileage_km, engine_cc, transmission, fuel, color, body_type, drive, price_ksh, booking_deposit_ksh, status, eta_date, images, description) values
 ('11111111-1111-1111-1111-111111111111','Toyota','Land Cruiser Prado TX',2019,48000,2800,'Automatic','Diesel','Pearl White','SUV','4WD',7850000,250000,'in_yard',null,'{/images/cars/prado.jpg,/images/cars/interior.jpg}','Clean TX-L package, sunroof, leather, 7 seats.'),
 ('11111111-1111-1111-1111-111111111111','Mazda','CX-5',2018,62000,2200,'Automatic','Diesel','Soul Red','SUV','AWD',3450000,100000,'in_yard',null,'{/images/cars/cx5.jpg,/images/cars/interior.jpg}','Diesel AWD, Bose sound, accident-free.'),
 ('11111111-1111-1111-1111-111111111111','Subaru','Forester XT',2017,71000,2000,'Automatic','Petrol','Ice Silver','SUV','AWD',2950000,100000,'on_ocean','2026-11-20','{/images/cars/forester.jpg,/images/cars/interior.jpg}','Turbo XT, EyeSight, arriving Mombasa soon.'),
 ('11111111-1111-1111-1111-111111111111','Toyota','Harrier',2020,39000,2000,'Automatic','Petrol','Jet Black','SUV','2WD',5200000,200000,'on_ocean','2026-11-28','{/images/cars/harrier.jpg,/images/cars/interior.jpg}','New shape Harrier, panoramic roof.'),
 ('22222222-2222-2222-2222-222222222222','Toyota','Land Cruiser Prado TX',2018,66000,2700,'Automatic','Petrol','Black','SUV','4WD',6900000,250000,'port_clearing','2026-11-05','{/images/cars/prado.jpg,/images/cars/interior.jpg}','Clearing at Mombasa Port this week.'),
 ('22222222-2222-2222-2222-222222222222','Mazda','CX-5',2019,51000,2500,'Automatic','Petrol','Machine Grey','SUV','2WD',3650000,100000,'in_yard',null,'{/images/cars/cx5.jpg,/images/cars/interior.jpg}','Low mileage, full service history.'),
 ('22222222-2222-2222-2222-222222222222','Subaru','Forester',2019,44000,2000,'Automatic','Petrol','Blue','SUV','AWD',3300000,100000,'in_yard',null,'{/images/cars/forester.jpg,/images/cars/interior.jpg}','Non-turbo, economical daily driver.'),
 ('22222222-2222-2222-2222-222222222222','Toyota','Harrier',2019,58000,2000,'Automatic','Petrol','Pearl White','SUV','2WD',4600000,150000,'purchased_japan','2026-12-15','{/images/cars/harrier.jpg,/images/cars/interior.jpg}','Just bought at auction in Japan.');
