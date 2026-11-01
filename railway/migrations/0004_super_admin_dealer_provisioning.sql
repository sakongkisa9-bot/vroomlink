begin;

alter table dealers
  add column yard_id uuid generated always as (id) stored;

grant insert on dealers, workers to vroomlink_app;

create policy dealers_super_admin_create on dealers for insert to public
  with check (has_role(current_vroomlink_user_id(), 'super_admin'));

create policy workers_super_admin_create on workers for insert to public
  with check (has_role(current_vroomlink_user_id(), 'super_admin'));

commit;
