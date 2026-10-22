-- Internal cron authentication for CAM SPORTS NFL. No token is exposed or returned.
-- Edge's service_role client verifies the Vault value through an RPC inaccessible to browser roles.
select vault.create_secret(
  encode(gen_random_bytes(32), 'hex'),
  'cam_nfl_cron_token',
  'Private random token for Supabase Cron to invoke NFL synchronization'
)
where not exists (select 1 from vault.secrets where name='cam_nfl_cron_token');

create or replace function public.cam_nfl_validate_cron(p_secret text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(length(p_secret)=64 and exists(
   select 1 from vault.decrypted_secrets s
   where s.name='cam_nfl_cron_token' and s.decrypted_secret=p_secret
 ),false);
$$;

revoke all on function public.cam_nfl_validate_cron(text) from public, anon, authenticated;
grant execute on function public.cam_nfl_validate_cron(text) to service_role;
notify pgrst,'reload schema';
