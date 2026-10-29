begin;

create function link_authenticated_worker_identity()
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
        and d.subscription_status = 'ACTIVE'
        and d.subscription_expires_at > now()
    );

  get diagnostics linked_count = row_count;
  return linked_count;
end
$$;

revoke all on function link_authenticated_worker_identity() from public;
grant execute on function link_authenticated_worker_identity() to vroomlink_app;

commit;
