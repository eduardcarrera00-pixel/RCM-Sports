-- CAM SPORTS: perfiles de prueba identificados mediante el ID de usuario público.
create table if not exists public.cam_demo_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 marked_at timestamptz not null default now()
);
comment on table public.cam_demo_accounts is 'Identificadores públicos de perfiles de prueba de CAM SPORTS; no representan participación independiente.';
alter table public.cam_demo_accounts enable row level security;
revoke all on public.cam_demo_accounts from public, anon, authenticated;
grant select on public.cam_demo_accounts to anon, authenticated;
drop policy if exists "demo_accounts_public_read" on public.cam_demo_accounts;
create policy "demo_accounts_public_read" on public.cam_demo_accounts for select to anon, authenticated using (true);
insert into public.cam_demo_accounts(user_id)
select user_id from public.ae_auth_accounts where username in ('colchonero_sur','tribuna_azteca','cincy_bengal','cityzen_10','xeneize_12','kingdom_chiefs','buffalo_mafia','cule_1899','gunner_norte','fly_eagles','dallas_88','madridista_en_serie','flock_baltimore','motorcity_lions','reddevil_77','anfieldecho','hawks_12','greenbay_12','sf_49ers','bianconera_7') and user_id is not null
on conflict (user_id) do nothing;
