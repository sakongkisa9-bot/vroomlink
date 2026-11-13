begin;

-- Set on accounts created with an owner-issued temporary password; cleared on first password change.
alter table "user" add column "mustChangePassword" boolean not null default false;

commit;
