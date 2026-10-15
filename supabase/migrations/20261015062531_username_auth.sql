begin;
create table public.ae_auth_accounts (
 username text primary key check(username=lower(username) and username ~ '^[a-z0-9_]{3,30}$'),
 user_id uuid unique references auth.users(id) on delete cascade,
 email text not null unique,
 reservation uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(),
 recovery_hash text check(recovery_hash is null or recovery_hash ~ '^[0-9a-f]{64}$'),
 recovery_token uuid
);
create table public.ae_auth_limits (
 bucket text primary key,
 hits integer not null,
 expires_at timestamptz not null
);
alter table public.ae_auth_accounts enable row level security;
alter table public.ae_auth_limits enable row level security;
revoke all on public.ae_auth_accounts,public.ae_auth_limits from public,anon,authenticated;
grant all on public.ae_auth_accounts,public.ae_auth_limits to service_role;
-- No client policies by design: only the server's service role can access these.
-- Bind existing valid unique names without changing users, passwords or editor roles.
with names as (
 select id,lower(email) as email,lower(coalesce(nullif(raw_user_meta_data->>'username',''),split_part(email,'@',1))) as username
 from auth.users where email is not null
), unique_names as (
 select *,count(*) over(partition by username) as n from names
)
insert into public.ae_auth_accounts(username,user_id,email)
select username,id,email from unique_names where n=1 and username ~ '^[a-z0-9_]{3,30}$';
create function public.ae_auth_take_limit(p_bucket text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare used integer;
begin
 if length(p_bucket)>200 or p_limit<1 or p_seconds not between 1 and 86400 then raise exception 'Invalid limit'; end if;
 delete from public.ae_auth_limits where expires_at<now()-interval '1 day';
 insert into public.ae_auth_limits(bucket,hits,expires_at)
 values(p_bucket,1,now()+make_interval(secs=>p_seconds))
 on conflict(bucket) do update set
 hits=case when ae_auth_limits.expires_at<=now() then 1 else ae_auth_limits.hits+1 end,
 expires_at=case when ae_auth_limits.expires_at<=now() then now()+make_interval(secs=>p_seconds) else ae_auth_limits.expires_at end
 returning hits into used;
 return used<=p_limit;
end $$;
revoke all on function public.ae_auth_take_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.ae_auth_take_limit(text,integer,integer) to service_role;
commit;
