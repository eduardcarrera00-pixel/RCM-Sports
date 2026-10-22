-- Sustained sync failures surface as an in-app alert to authenticated CAM SPORTS editors.
create table if not exists public.cam_nfl_admin_alerts(
 id bigint generated always as identity primary key,
 kind text not null,
 message text not null,
 created_at timestamptz not null default now(),
 acknowledged_at timestamptz
);
create unique index if not exists cam_nfl_alerts_one_active_kind
 on public.cam_nfl_admin_alerts(kind) where acknowledged_at is null;
alter table public.cam_nfl_admin_alerts enable row level security;
revoke all on public.cam_nfl_admin_alerts from public,anon,authenticated;
grant select on public.cam_nfl_admin_alerts to authenticated;
create policy cam_nfl_alert_read on public.cam_nfl_admin_alerts for select
 to authenticated using(auth.uid() is not null and public.rcm_is_editor());
grant select,insert,update on public.cam_nfl_admin_alerts to service_role;
create or replace function public.cam_nfl_watch_sync_failures()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare failed integer;
begin
 if new.ok is not false or old.ok is not distinct from new.ok then return new;end if;
 select count(*) into failed from (
  select ok from public.cam_nfl_sync_runs
  where mode=new.mode and finished_at is not null order by id desc limit 3
 ) recent where ok=false;
 if failed>=3 then
  insert into public.cam_nfl_admin_alerts(kind,message)
   values('nfl_sync_'||new.mode,'La sincronización NFL lleva 3 intentos consecutivos fallidos. Revisar proveedor y Supabase Cron.')
  on conflict do nothing;
 end if;
 return new;
end $fn$;
drop trigger if exists cam_nfl_sync_failures_trg on public.cam_nfl_sync_runs;
create trigger cam_nfl_sync_failures_trg after update of ok on public.cam_nfl_sync_runs
 for each row execute function public.cam_nfl_watch_sync_failures();
revoke all on function public.cam_nfl_watch_sync_failures() from public,anon,authenticated;
notify pgrst,'reload schema';