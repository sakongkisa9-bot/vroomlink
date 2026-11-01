begin;

alter table public.dealers
  add column is_active boolean not null default true;

create or replace function public.current_vroomlink_role(target_dealer_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.workspace_role
  from public.workers w
  join public.dealers d on d.id = w.dealer_id
  where w.dealer_id = target_dealer_id
    and w.auth_user_id = public.current_vroomlink_user_id()
    and w.is_active
    and d.is_active
    and d.subscription_status = 'ACTIVE'
    and d.subscription_expires_at > now()
  limit 1
$$;

create or replace function public.yard_role_of(_user_id uuid, _yard_id uuid)
returns public.workspace_role
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
    and d.is_active
    and d.subscription_status = 'ACTIVE'
    and d.subscription_expires_at > now()
  limit 1
$$;

create or replace function public.link_authenticated_worker_identity()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  identity_user_id uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  identity_email text := lower(btrim(nullif(current_setting('app.worker_email', true), '')));
  linked_count integer;
begin
  if identity_user_id is null or identity_email is null then
    raise exception 'Authenticated user identity is required';
  end if;

  update public.workers w
  set auth_user_id = identity_user_id
  where lower(btrim(w.email)) = identity_email
    and w.auth_user_id is null
    and w.is_active
    and not exists (
      select 1
      from public.workers linked
      where linked.dealer_id = w.dealer_id
        and linked.auth_user_id = identity_user_id
    )
    and exists (
      select 1
      from public.dealers d
      where d.id = w.dealer_id
        and d.is_active
        and d.subscription_status = 'ACTIVE'
        and d.subscription_expires_at > now()
    );

  get diagnostics linked_count = row_count;
  return linked_count;
end
$$;

revoke all on function public.link_authenticated_worker_identity() from public;
grant execute on function public.link_authenticated_worker_identity() to vroomlink_app;

create or replace function public.is_active_dealer_salesperson(
  target_worker_id uuid,
  target_yard_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workers w
    join public.dealers d on d.id = w.dealer_id
    where w.id = target_worker_id
      and w.dealer_id = target_yard_id
      and w.workspace_role = 'SALESPERSON'
      and w.is_active
      and d.is_active
      and d.subscription_status = 'ACTIVE'
      and d.subscription_expires_at > now()
  )
$$;

drop policy if exists dealers_public_read on public.dealers;
create policy dealers_public_read on public.dealers for select to public
  using (
    is_system_active()
    and (
      (
        is_active
        and subscription_status = 'ACTIVE'
        and subscription_expires_at > now()
      )
      or current_vroomlink_role(id) is not null
    )
  );

drop policy if exists dealers_admin_read on public.dealers;
create policy dealers_admin_read on public.dealers for select to public
  using (has_role(current_vroomlink_user_id(), 'super_admin'));

drop policy if exists dealers_admin_update on public.dealers;
create policy dealers_admin_update on public.dealers for update to public
  using (has_role(current_vroomlink_user_id(), 'super_admin'))
  with check (has_role(current_vroomlink_user_id(), 'super_admin'));

drop policy if exists workers_member_read on public.workers;
create policy workers_member_read on public.workers for select to public
  using (
    is_system_active()
    and current_vroomlink_role(dealer_id) is not null
    and (
      auth_user_id = current_vroomlink_user_id()
      or current_vroomlink_role(dealer_id) in ('OWNER', 'YARD_MANAGER')
    )
  );

create policy workers_admin_read on public.workers for select to public
  using (has_role(current_vroomlink_user_id(), 'super_admin'));

drop policy if exists cars_public_read on public.cars;
create policy cars_public_read on public.cars for select to public
  using (
    is_system_active()
    and (
      (
        is_published
        and exists (
          select 1 from public.dealers d
          where d.id = cars.dealer_id
            and d.is_active
            and d.subscription_status = 'ACTIVE'
            and d.subscription_expires_at > now()
        )
      )
      or current_vroomlink_role(dealer_id) is not null
    )
  );

drop policy if exists booking_deposits_public_create on public.booking_deposits;
create policy booking_deposits_public_create on public.booking_deposits for insert to public
  with check (
    is_system_active()
    and exists (
      select 1 from public.cars c
      join public.dealers d on d.id = c.dealer_id
      where c.id = booking_deposits.vehicle_id
        and c.dealer_id = booking_deposits.dealer_id
        and c.is_published
        and d.is_active
        and d.subscription_status = 'ACTIVE'
        and d.subscription_expires_at > now()
        and booking_deposits.amount_ksh = c.booking_deposit_ksh
    )
    and (
      booking_deposits.referral_broker_id is null
      or public.is_active_dealer_salesperson(
        booking_deposits.referral_broker_id,
        booking_deposits.dealer_id
      )
    )
  );

drop policy if exists subscription_events_admin_read on public.subscription_events;
create policy subscription_events_admin_read on public.subscription_events for select to public
  using (has_role(current_vroomlink_user_id(), 'super_admin'));

drop policy if exists system_logs_owner_read on public.system_logs;
create policy system_logs_owner_read on public.system_logs for select to public
  using (
    has_role(current_vroomlink_user_id(), 'super_admin')
    or (
      is_system_active()
      and dealer_id is not null
      and yard_role_of(current_vroomlink_user_id(), dealer_id) = 'OWNER'
    )
  );

commit;
