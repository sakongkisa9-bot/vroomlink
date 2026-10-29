begin;

alter table workers
  add column yard_id uuid generated always as (dealer_id) stored;
alter table cars
  add column yard_id uuid generated always as (dealer_id) stored;
alter table import_costs
  add column yard_id uuid generated always as (dealer_id) stored;
alter table system_logs
  add column yard_id uuid generated always as (dealer_id) stored;
alter table booking_deposits
  add column yard_id uuid generated always as (dealer_id) stored;
alter table subscription_events
  add column yard_id uuid generated always as (dealer_id) stored;

create function yard_role_of(_user_id uuid, _yard_id uuid)
returns workspace_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.workspace_role
  from public.workers w
  join public.dealers d on d.id = w.dealer_id
  where w.auth_user_id = _user_id
    and w.dealer_id = _yard_id
    and w.is_active
    and d.subscription_status = 'ACTIVE'
    and d.subscription_expires_at > now()
  limit 1
$$;

create function has_role(_user_id uuid, _role text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select _role = 'super_admin'
    and _user_id = current_vroomlink_user_id()
    and current_setting('app.is_super_admin', true) = 'true'
$$;

revoke all on function yard_role_of(uuid, uuid) from public;
revoke all on function has_role(uuid, text) from public;
grant execute on function yard_role_of(uuid, uuid), has_role(uuid, text) to vroomlink_app;

create or replace function write_system_log()
returns trigger
language plpgsql
security definer
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

  dealer_key := nullif(coalesce(entry ->> 'yard_id', entry ->> 'dealer_id'), '')::uuid;
  record_key := coalesce(entry ->> 'id', entry ->> 'car_id', entry ->> 'vehicle_id', 'global');
  actor_email := coalesce(nullif(current_setting('app.worker_email', true), ''), 'system');

  insert into system_logs (dealer_id, worker_email, action_performed, record_id)
  values (dealer_key, actor_email, tg_op || ':' || tg_table_name, record_key);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

create table vehicle_trade_pricing (
  car_id uuid primary key,
  yard_id uuid not null references dealers(id) on delete cascade,
  wholesale_price bigint not null check (wholesale_price >= 0),
  broker_commission_rate_percent numeric(5, 2) not null
    check (broker_commission_rate_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (car_id, yard_id) references cars(id, dealer_id) on delete cascade
);

create table broker_leads (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references dealers(id) on delete cascade,
  car_id uuid not null,
  salesperson_worker_id uuid not null references workers(id),
  customer_name text not null,
  customer_phone text not null,
  status text not null default 'NEW'
    check (status in ('NEW', 'CONTACTED', 'CONVERTED', 'LOST')),
  created_at timestamptz not null default now(),
  foreign key (car_id, yard_id) references cars(id, dealer_id) on delete cascade
);

create table vehicle_sales (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid not null references dealers(id) on delete cascade,
  car_id uuid not null unique,
  broker_worker_id uuid references workers(id),
  recorded_by_worker_id uuid not null references workers(id),
  final_sale_price bigint not null check (final_sale_price > 0),
  commission_rate_percent numeric(5, 2) not null default 0
    check (commission_rate_percent between 0 and 100),
  commission_amount bigint not null default 0 check (commission_amount >= 0),
  sold_at timestamptz not null default now(),
  foreign key (car_id, yard_id) references cars(id, dealer_id) on delete cascade
);

create function set_vehicle_sale_commission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.broker_worker_id is null then
    new.commission_rate_percent := 0;
    new.commission_amount := 0;
    return new;
  end if;

  if not exists (
    select 1
    from public.workers w
    where w.id = new.broker_worker_id
      and w.dealer_id = new.yard_id
      and w.workspace_role = 'SALESPERSON'
      and w.is_active
  ) then
    raise exception 'Broker must be an active salesperson assigned to this yard';
  end if;

  select tp.broker_commission_rate_percent
  into new.commission_rate_percent
  from public.vehicle_trade_pricing tp
  where tp.car_id = new.car_id and tp.yard_id = new.yard_id;

  if new.commission_rate_percent is null then
    raise exception 'Broker commission rate has not been configured for this vehicle';
  end if;

  new.commission_amount :=
    round(new.final_sale_price * new.commission_rate_percent / 100)::bigint;
  return new;
end
$$;

create trigger vehicle_sales_set_commission
  before insert on vehicle_sales
  for each row execute function set_vehicle_sale_commission();

create trigger vehicle_trade_pricing_system_log
  after insert or update or delete on vehicle_trade_pricing
  for each row execute function write_system_log();
create trigger broker_leads_system_log
  after insert or update or delete on broker_leads
  for each row execute function write_system_log();
create trigger vehicle_sales_system_log
  after insert or update or delete on vehicle_sales
  for each row execute function write_system_log();

create index broker_leads_worker_created_idx
  on broker_leads(salesperson_worker_id, created_at desc);
create index vehicle_sales_broker_sold_idx
  on vehicle_sales(broker_worker_id, sold_at desc)
  where broker_worker_id is not null;
create index vehicle_sales_dealer_sold_idx
  on vehicle_sales(yard_id, sold_at desc);

create function is_active_dealer_salesperson(target_worker_id uuid, target_yard_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workers w
    where w.id = target_worker_id
      and w.dealer_id = target_yard_id
      and w.workspace_role = 'SALESPERSON'
      and w.is_active
  )
$$;
revoke all on function is_active_dealer_salesperson(uuid, uuid) from public;
grant execute on function is_active_dealer_salesperson(uuid, uuid) to vroomlink_app;

alter table vehicle_trade_pricing enable row level security;
alter table broker_leads enable row level security;
alter table vehicle_sales enable row level security;

drop policy global_settings_super_admin_update on global_settings;
create policy global_settings_super_admin_update on global_settings for update to public
  using (has_role(current_vroomlink_user_id(), 'super_admin'))
  with check (has_role(current_vroomlink_user_id(), 'super_admin'));

drop policy dealers_public_read on dealers;
create policy dealers_public_read on dealers for select to public
  using (
    is_system_active()
    and (
      (subscription_status = 'ACTIVE' and subscription_expires_at > now())
      or yard_role_of(current_vroomlink_user_id(), id) is not null
    )
  );
drop policy dealers_admin_read on dealers;
create policy dealers_admin_read on dealers for select to public
  using (is_system_active() and has_role(current_vroomlink_user_id(), 'super_admin'));
drop policy dealers_owner_update on dealers;
create policy dealers_owner_update on dealers for update to public
  using (is_system_active() and yard_role_of(current_vroomlink_user_id(), id) = 'OWNER')
  with check (is_system_active() and yard_role_of(current_vroomlink_user_id(), id) = 'OWNER');
drop policy dealers_admin_update on dealers;
create policy dealers_admin_update on dealers for update to public
  using (is_system_active() and has_role(current_vroomlink_user_id(), 'super_admin'))
  with check (is_system_active() and has_role(current_vroomlink_user_id(), 'super_admin'));

drop policy workers_member_read on workers;
create policy workers_member_read on workers for select to public
  using (
    is_system_active()
    and (
      auth_user_id = current_vroomlink_user_id()
      or yard_role_of(current_vroomlink_user_id(), dealer_id) in ('OWNER', 'YARD_MANAGER')
    )
  );
drop policy workers_owner_manage on workers;
create policy workers_owner_manage on workers for all to public
  using (is_system_active() and yard_role_of(current_vroomlink_user_id(), dealer_id) = 'OWNER')
  with check (is_system_active() and yard_role_of(current_vroomlink_user_id(), dealer_id) = 'OWNER');

drop policy cars_public_read on cars;
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
      or yard_role_of(current_vroomlink_user_id(), dealer_id) is not null
    )
  );
drop policy cars_staff_manage on cars;
create policy cars_staff_manage on cars for all to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id) in ('OWNER', 'YARD_MANAGER')
  )
  with check (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id) in ('OWNER', 'YARD_MANAGER')
  );

drop policy import_costs_staff_read on import_costs;
create policy import_costs_staff_read on import_costs for select to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id) in ('OWNER', 'YARD_MANAGER')
  );
drop policy import_costs_staff_manage on import_costs;
create policy import_costs_staff_manage on import_costs for all to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id) in ('OWNER', 'YARD_MANAGER')
  )
  with check (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id) in ('OWNER', 'YARD_MANAGER')
  );

drop policy system_logs_owner_read on system_logs;
create policy system_logs_owner_read on system_logs for select to public
  using (
    is_system_active()
    and (
      has_role(current_vroomlink_user_id(), 'super_admin')
      or (
        dealer_id is not null
        and yard_role_of(current_vroomlink_user_id(), dealer_id) = 'OWNER'
      )
    )
  );

drop policy booking_deposits_public_create on booking_deposits;
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
    and (
      booking_deposits.referral_broker_id is null
      or is_active_dealer_salesperson(
        booking_deposits.referral_broker_id,
        booking_deposits.dealer_id
      )
    )
  );

drop policy booking_deposits_staff_read on booking_deposits;
create policy booking_deposits_staff_read on booking_deposits for select to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id) in ('OWNER', 'YARD_MANAGER')
  );

drop policy subscription_events_admin_read on subscription_events;
create policy subscription_events_admin_read on subscription_events for select to public
  using (is_system_active() and has_role(current_vroomlink_user_id(), 'super_admin'));
drop policy subscription_events_admin_insert on subscription_events;
create policy subscription_events_admin_insert on subscription_events for insert to public
  with check (is_system_active() and has_role(current_vroomlink_user_id(), 'super_admin'));

create policy vehicle_trade_pricing_read on vehicle_trade_pricing for select to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), yard_id) in ('OWNER', 'YARD_MANAGER', 'SALESPERSON')
  );
create policy vehicle_trade_pricing_manage on vehicle_trade_pricing for all to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), yard_id) in ('OWNER', 'YARD_MANAGER')
  )
  with check (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), yard_id) in ('OWNER', 'YARD_MANAGER')
  );

create policy broker_leads_read on broker_leads for select to public
  using (
    is_system_active()
    and (
      yard_role_of(current_vroomlink_user_id(), yard_id) in ('OWNER', 'YARD_MANAGER')
      or salesperson_worker_id = (
        select w.id from workers w
        where w.auth_user_id = current_vroomlink_user_id()
          and w.dealer_id = broker_leads.yard_id
          and w.workspace_role = 'SALESPERSON'
          and w.is_active
      )
    )
  );
create policy broker_leads_create on broker_leads for insert to public
  with check (
    is_system_active()
    and salesperson_worker_id = (
      select w.id from workers w
      where w.auth_user_id = current_vroomlink_user_id()
        and w.dealer_id = broker_leads.yard_id
        and w.workspace_role = 'SALESPERSON'
        and w.is_active
    )
    and exists (
      select 1 from cars c
      where c.id = broker_leads.car_id
        and c.dealer_id = broker_leads.yard_id
        and c.is_published
    )
  );

create policy vehicle_sales_read on vehicle_sales for select to public
  using (
    is_system_active()
    and (
      yard_role_of(current_vroomlink_user_id(), yard_id) in ('OWNER', 'YARD_MANAGER')
      or broker_worker_id = (
        select w.id from workers w
        where w.auth_user_id = current_vroomlink_user_id()
          and w.dealer_id = vehicle_sales.yard_id
          and w.workspace_role = 'SALESPERSON'
          and w.is_active
      )
    )
  );
create policy vehicle_sales_create on vehicle_sales for insert to public
  with check (
    is_system_active()
    and recorded_by_worker_id = (
      select w.id from workers w
      where w.auth_user_id = current_vroomlink_user_id()
        and w.dealer_id = vehicle_sales.yard_id
        and w.workspace_role in ('OWNER', 'YARD_MANAGER')
        and w.is_active
    )
    and (
      broker_worker_id is null
      or exists (
        select 1 from workers w
        where w.id = vehicle_sales.broker_worker_id
          and w.dealer_id = vehicle_sales.yard_id
          and w.workspace_role = 'SALESPERSON'
          and w.is_active
      )
    )
  );

grant select, insert, update, delete on vehicle_trade_pricing to vroomlink_app;
grant select, insert on broker_leads to vroomlink_app;
grant select, insert on vehicle_sales to vroomlink_app;

commit;
