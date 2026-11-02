begin;

grant delete on public.dealers to vroomlink_app;

create policy dealers_super_admin_delete on public.dealers for delete to public
  using (has_role(current_vroomlink_user_id(), 'super_admin'));

commit;
