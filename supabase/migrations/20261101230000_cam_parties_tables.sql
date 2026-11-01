-- CAM SPORTS · Parties (1 de 2): tablas y RLS.
--
-- Un party es un grupo privado de amigos con su propia clasificación. Cada
-- party es de un tipo (Picks o Takes, fijo desde que se crea) y, opcionalmente,
-- de un deporte (todos, fútbol o NFL). Se entra con un código de 6 caracteres.
--
-- Solo los miembros leen su party (y los administradores, para moderar).
-- Ninguna escritura va directa a las tablas: todo pasa por las funciones
-- security definer de la migración siguiente.
--
-- Quinielas más adelante: ampliar cam_parties_kind_check con 'quiniela' y
-- añadir su rama en public.cam_party_score_rows() y cam_party_activity().

create table public.cam_parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null,
  sport text not null default 'all',
  code text not null,
  owner_id uuid not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cam_parties_name_check
    check (name = btrim(name) and char_length(name) between 3 and 40),
  constraint cam_parties_kind_check check (kind in ('picks','takes')),
  constraint cam_parties_sport_check check (sport in ('all','football','nfl')),
  -- Sin letras ni números que se confundan: fuera 0, O, 1, I y L.
  constraint cam_parties_code_check check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  constraint cam_parties_code_key unique (code)
);
comment on table public.cam_parties is
  'Parties: grupos privados con clasificación propia (Picks o Takes). Escritura solo por RPC cam_party_*.';
create index cam_parties_owner_idx on public.cam_parties(owner_id);

create table public.cam_party_members (
  party_id uuid not null references public.cam_parties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Solo cuenta lo publicado desde este momento. Salir borra la fila: al volver
  -- se empieza de cero.
  joined_at timestamptz not null default clock_timestamp(),
  show_on_profile boolean not null default true,
  primary key (party_id, user_id)
);
comment on table public.cam_party_members is
  'Miembros de cada party. joined_at marca desde cuándo cuentan sus Picks/Takes en ese party.';
create index cam_party_members_user_idx on public.cam_party_members(user_id);

-- Intentos de código (vista previa y unirse) para frenar a quien prueba códigos
-- al azar: unos 20 intentos fallidos por hora por usuario (o por IP sin sesión).
create table public.cam_party_code_attempts (
  id bigint generated always as identity primary key,
  actor text not null,
  ok boolean not null,
  attempted_at timestamptz not null default now()
);
create index cam_party_code_attempts_actor_idx on public.cam_party_code_attempts(actor, attempted_at);
create index cam_party_code_attempts_time_idx on public.cam_party_code_attempts(attempted_at);

-- ¿Es el usuario de la sesión miembro de este party? Security definer para que
-- la política de cam_party_members pueda consultarse a sí misma sin recursión.
create function public.cam_party_is_member(p_party uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.cam_party_members m
     where m.party_id = p_party and m.user_id = (select auth.uid())
  );
$$;

alter table public.cam_parties enable row level security;
alter table public.cam_party_members enable row level security;
alter table public.cam_party_code_attempts enable row level security;

create policy cam_parties_member_read on public.cam_parties
  for select to authenticated
  using (public.cam_party_is_member(id) or (select public.rcm_is_editor()));

create policy cam_party_members_member_read on public.cam_party_members
  for select to authenticated
  using (public.cam_party_is_member(party_id) or (select public.rcm_is_editor()));

-- Sin políticas de escritura: insert/update/delete solo desde las funciones.
revoke all on public.cam_parties from anon, authenticated;
revoke all on public.cam_party_members from anon, authenticated;
revoke all on public.cam_party_code_attempts from anon, authenticated;
grant select on public.cam_parties to authenticated;
grant select on public.cam_party_members to authenticated;

revoke all on function public.cam_party_is_member(uuid) from public, anon;
grant execute on function public.cam_party_is_member(uuid) to authenticated;
