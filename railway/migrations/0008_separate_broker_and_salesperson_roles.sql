begin;

update public.workers
set workspace_role = 'BROKER'
where workspace_role = 'SALESPERSON';

update public.workers
set workspace_role = 'SALESPERSON'
where workspace_role = 'YARD_MANAGER';

create or replace function public.set_vehicle_sale_commission()
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
      and w.workspace_role = 'BROKER'
      and w.is_active
  ) then
    raise exception 'Broker must be active and assigned to this yard';
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
      and w.workspace_role = 'BROKER'
      and w.is_active
      and d.is_active
      and d.subscription_status = 'ACTIVE'
      and d.subscription_expires_at > now()
  )
$$;

drop policy workers_member_read on public.workers;
create policy workers_member_read on public.workers for select to public
  using (
    is_system_active()
    and (
      auth_user_id = current_vroomlink_user_id()
      or yard_role_of(current_vroomlink_user_id(), dealer_id) in ('OWNER', 'YARD_MANAGER')
      or (
        yard_role_of(current_vroomlink_user_id(), dealer_id) = 'SALESPERSON'
        and workspace_role = 'BROKER'
        and is_active
      )
    )
  );

drop policy cars_staff_manage on public.cars;
create policy cars_staff_manage on public.cars for all to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id)
      in ('OWNER', 'YARD_MANAGER')
  )
  with check (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id)
      in ('OWNER', 'YARD_MANAGER')
  );

create policy cars_salesperson_create on public.cars for insert to public
  with check (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id) = 'SALESPERSON'
  );

create policy cars_salesperson_read on public.cars for select to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id) = 'SALESPERSON'
  );

create policy cars_salesperson_update on public.cars for update to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id) = 'SALESPERSON'
  )
  with check (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id) = 'SALESPERSON'
  );

drop policy import_costs_staff_read on public.import_costs;
create policy import_costs_staff_read on public.import_costs for select to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id)
      in ('OWNER', 'YARD_MANAGER', 'SALESPERSON')
  );

drop policy import_costs_staff_manage on public.import_costs;
create policy import_costs_staff_manage on public.import_costs for all to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id)
      in ('OWNER', 'YARD_MANAGER')
  )
  with check (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id)
      in ('OWNER', 'YARD_MANAGER')
  );

create policy import_costs_salesperson_create on public.import_costs for insert to public
  with check (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id) = 'SALESPERSON'
  );

create policy import_costs_salesperson_update on public.import_costs for update to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id) = 'SALESPERSON'
  )
  with check (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), dealer_id) = 'SALESPERSON'
  );

drop policy vehicle_trade_pricing_read on public.vehicle_trade_pricing;
create policy vehicle_trade_pricing_read on public.vehicle_trade_pricing for select to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), yard_id)
      in ('OWNER', 'YARD_MANAGER', 'SALESPERSON', 'BROKER')
  );

drop policy vehicle_trade_pricing_manage on public.vehicle_trade_pricing;
create policy vehicle_trade_pricing_manage on public.vehicle_trade_pricing for all to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), yard_id)
      in ('OWNER', 'YARD_MANAGER')
  )
  with check (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), yard_id)
      in ('OWNER', 'YARD_MANAGER')
  );

create policy vehicle_trade_pricing_salesperson_create on public.vehicle_trade_pricing for insert to public
  with check (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), yard_id) = 'SALESPERSON'
  );

create policy vehicle_trade_pricing_salesperson_update on public.vehicle_trade_pricing for update to public
  using (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), yard_id) = 'SALESPERSON'
  )
  with check (
    is_system_active()
    and yard_role_of(current_vroomlink_user_id(), yard_id) = 'SALESPERSON'
  );
drop policy broker_leads_read on public.broker_leads;
create policy broker_leads_read on public.broker_leads for select to public
  using (
    is_system_active()
    and (
      yard_role_of(current_vroomlink_user_id(), yard_id) in ('OWNER', 'YARD_MANAGER')
      or salesperson_worker_id = (
        select w.id from public.workers w
        where w.auth_user_id = current_vroomlink_user_id()
          and w.dealer_id = broker_leads.yard_id
          and w.workspace_role = 'BROKER'
          and w.is_active
      )
    )
  );

drop policy broker_leads_create on public.broker_leads;
create policy broker_leads_create on public.broker_leads for insert to public
  with check (
    is_system_active()
    and salesperson_worker_id = (
      select w.id from public.workers w
      where w.auth_user_id = current_vroomlink_user_id()
        and w.dealer_id = broker_leads.yard_id
        and w.workspace_role = 'BROKER'
        and w.is_active
    )
    and exists (
      select 1 from public.cars c
      where c.id = broker_leads.car_id
        and c.dealer_id = broker_leads.yard_id
        and c.is_published
    )
  );

drop policy vehicle_sales_read on public.vehicle_sales;
create policy vehicle_sales_read on public.vehicle_sales for select to public
  using (
    is_system_active()
    and (
      yard_role_of(current_vroomlink_user_id(), yard_id)
        in ('OWNER', 'YARD_MANAGER', 'SALESPERSON')
      or broker_worker_id = (
        select w.id from public.workers w
        where w.auth_user_id = current_vroomlink_user_id()
          and w.dealer_id = vehicle_sales.yard_id
          and w.workspace_role = 'BROKER'
          and w.is_active
      )
    )
  );

drop policy vehicle_sales_create on public.vehicle_sales;
create policy vehicle_sales_create on public.vehicle_sales for insert to public
  with check (
    is_system_active()
    and recorded_by_worker_id = (
      select w.id from public.workers w
      where w.auth_user_id = current_vroomlink_user_id()
        and w.dealer_id = vehicle_sales.yard_id
        and w.workspace_role in ('OWNER', 'YARD_MANAGER', 'SALESPERSON')
        and w.is_active
    )
    and (
      broker_worker_id is null
      or exists (
        select 1 from public.workers w
        where w.id = vehicle_sales.broker_worker_id
          and w.dealer_id = vehicle_sales.yard_id
          and w.workspace_role = 'BROKER'
          and w.is_active
      )
    )
  );

commit;
