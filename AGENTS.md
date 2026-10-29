<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Multi-tenancy is enforced in the database: every tenant table carries `yard_id`, and RLS uses `yard_role_of()` / `has_role()` security-definer helpers — never filter tenants only in the UI.
- The global kill switch lives in `system_settings.is_system_active`; RLS policies AND `is_system_active()` and the root route `beforeLoad` renders the maintenance screen, so both reads/writes and UI stop together.
- Trade pricing (wholesale, commission, landed costs) lives in `vehicle_trade_pricing`, never on `vehicles`, so public catalog reads cannot leak it.
- Public catalog data is fetched through server functions in `src/lib/catalog.functions.ts` using a publishable-key client; privileged writes load `supabaseAdmin` inside the handler.
- Audit logs are written only by database triggers and have no update/delete grants, keeping them immutable.
