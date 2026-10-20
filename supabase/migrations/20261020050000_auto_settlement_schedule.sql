-- AE SPORTS · Programa la verificación automática de resultados cada hora (gratis: pg_cron + pg_net).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Clave interna que solo conocen la base de datos y la tarea programada.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ae_settle_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'ae_settle_cron', 'Llamadas programadas a ae-settle-picks');
  end if;
end $$;

-- La función ae-settle-picks comprueba con esto que la llamada viene de la tarea programada.
create or replace function public.ae_settle_cron_ok(p_secret text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'ae_settle_cron' and decrypted_secret = p_secret and length(p_secret) > 20);
$$;
revoke all on function public.ae_settle_cron_ok(text) from public, anon, authenticated;
grant execute on function public.ae_settle_cron_ok(text) to service_role;

-- Cada hora, al minuto 17.
select cron.unschedule('ae-settle-picks') where exists (select 1 from cron.job where jobname = 'ae-settle-picks');
select cron.schedule('ae-settle-picks', '17 * * * *', $job$
  select net.http_post(
    url := 'https://zahuhmvmqvxaunqebqaa.supabase.co/functions/v1/ae-settle-picks',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-ae-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'ae_settle_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$job$);
