begin;

alter table public.cars
  add column source_country text,
  add column source_seller text,
  add column title_status text,
  add column logbook_number text,
  add column import_entry_number text,
  add column condition_grade text,
  add column accident_history text,
  add column service_history text,
  add column inspection_notes text;

commit;