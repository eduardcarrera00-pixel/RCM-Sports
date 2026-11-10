-- Aplicada en producción el 10 nov 2026 desde otra sesión (cuadro libre de la comunidad).
-- Se guarda aquí para que el repositorio coincida con Supabase. Desde 20261110120348 la
-- web ya no la usa (un solo cuadro, con puntos) y sus permisos quedan en leer/insertar/actualizar.
create table if not exists public.cam_liguilla_fan_brackets (
  user_id uuid not null references auth.users(id) on delete cascade,
  season integer not null check (season between 2020 and 2100),
  bracket jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, season),
  constraint cam_liguilla_fan_brackets_shape check (
    jsonb_typeof(bracket) = 'object'
    and jsonb_typeof(bracket->'teams') = 'array'
    and jsonb_array_length(bracket->'teams') = 8
    and jsonb_typeof(bracket->'semis') = 'array'
    and jsonb_array_length(bracket->'semis') = 4
    and jsonb_typeof(bracket->'finalists') = 'array'
    and jsonb_array_length(bracket->'finalists') = 2
    and (bracket->>'champion' is null or jsonb_typeof(bracket->'champion') = 'string')
  )
);
alter table public.cam_liguilla_fan_brackets enable row level security;
revoke all on public.cam_liguilla_fan_brackets from public, anon;
grant select,insert,update on public.cam_liguilla_fan_brackets to authenticated;
create policy "cam_fan_brackets_owner_read" on public.cam_liguilla_fan_brackets for select to authenticated
  using ((select auth.uid()) = user_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
create policy "cam_fan_brackets_owner_insert" on public.cam_liguilla_fan_brackets for insert to authenticated
  with check ((select auth.uid()) = user_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
create policy "cam_fan_brackets_owner_update" on public.cam_liguilla_fan_brackets for update to authenticated
  using ((select auth.uid()) = user_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false))
  with check ((select auth.uid()) = user_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
