-- AE SPORTS Takes, four football competitions, independent of Picks.
create table public.ae_take_questions (
 id uuid primary key default gen_random_uuid(),
 competition text not null check(competition in ('laliga','premier','ligamx','champions')),
 period text not null check(period in ('weekly','season')),
 season text not null default '2026/27',
 prompt text not null check(length(trim(prompt)) between 10 and 220),
 closes_at timestamptz not null,
 points int not null check(points between 1 and 100),
 status text not null default 'open' check(status in ('open','settled','void')),
 correct_option_id uuid,
 created_at timestamptz not null default now(),
 created_by uuid references auth.users(id),
 settled_at timestamptz
);
create table public.ae_take_options (
 id uuid primary key default gen_random_uuid(),
 question_id uuid not null references public.ae_take_questions(id) on delete cascade,
 label text not null check(length(trim(label)) between 1 and 100),
 unique(question_id,label),unique(question_id,id)
);
alter table public.ae_take_questions add constraint ae_take_correct_option_fk
 foreign key(id,correct_option_id) references public.ae_take_options(question_id,id);
create table public.ae_take_predictions(
 question_id uuid not null references public.ae_take_questions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 option_id uuid not null,
 created_at timestamptz not null default now(),
 awarded_points int not null default 0 check(awarded_points >= 0),
 primary key(question_id,user_id),
 foreign key(question_id,option_id) references public.ae_take_options(question_id,id)
);
create index ae_take_questions_status_idx on public.ae_take_questions(status,closes_at);
create index ae_take_predictions_user_idx on public.ae_take_predictions(user_id,created_at desc);
alter table public.ae_take_questions enable row level security;
alter table public.ae_take_options enable row level security;
alter table public.ae_take_predictions enable row level security;
revoke all on public.ae_take_questions,public.ae_take_options,public.ae_take_predictions from public,anon,authenticated;
grant select on public.ae_take_questions,public.ae_take_options to anon,authenticated;
grant select on public.ae_take_predictions to authenticated;
create policy ae_take_questions_read on public.ae_take_questions for select to anon,authenticated using(true);
create policy ae_take_options_read on public.ae_take_options for select to anon,authenticated using(true);
create policy ae_take_predictions_own on public.ae_take_predictions for select to authenticated using(user_id=(select auth.uid()));

create function public.ae_create_take(p_competition text,p_period text,p_prompt text,p_closes_at timestamptz,p_points int,p_options text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare q uuid; opt text;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 if p_competition is null or p_competition not in ('laliga','premier','ligamx','champions')
 or p_period is null or p_period not in ('weekly','season')
 or p_prompt is null or length(trim(p_prompt)) not between 10 and 220
 or p_closes_at is null or p_closes_at <= now()
 or p_points is null or p_points not between 1 and 100
 or p_options is null or cardinality(p_options) not between 2 and 16 or array_ndims(p_options) <> 1
 or exists(select 1 from unnest(p_options) x where x is null or length(trim(x)) not between 1 and 100)
 or (select count(distinct lower(trim(x))) from unnest(p_options) x) <> cardinality(p_options)
 then raise exception 'Datos de pregunta inválidos'; end if;
 insert into public.ae_take_questions(competition,period,prompt,closes_at,points,created_by)
 values(p_competition,p_period,trim(p_prompt),p_closes_at,p_points,auth.uid()) returning id into q;
 foreach opt in array p_options loop
 insert into public.ae_take_options(question_id,label) values(q,trim(opt));
 end loop;
 return q;
end $$;
create function public.ae_submit_take(p_question_id uuid,p_option_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid := auth.uid(); allowed boolean;
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Inicia sesión'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_question_id::text));
 select status='open' and closes_at>now() into allowed from public.ae_take_questions where id=p_question_id;
 if not coalesce(allowed,false) then raise exception 'Take cerrado'; end if;
 if not exists(select 1 from public.ae_take_options where question_id=p_question_id and id=p_option_id)
 then raise exception 'Opción inválida'; end if;
 insert into public.ae_take_predictions(question_id,user_id,option_id) values(p_question_id,me,p_option_id)
 on conflict(question_id,user_id) do nothing;
 if not found then raise exception 'Ya participaste'; end if;
 return true;
end $$;
create function public.ae_settle_take(p_question_id uuid,p_option_id uuid)
returns int language plpgsql security definer set search_path='' as $$
declare q public.ae_take_questions%rowtype; winners int;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_question_id::text));
 select * into q from public.ae_take_questions where id=p_question_id for update;
 if not found or q.status<>'open' or q.closes_at>now() then raise exception 'Take no finalizado'; end if;
 if not exists(select 1 from public.ae_take_options where question_id=p_question_id and id=p_option_id)
 then raise exception 'Resultado inválido'; end if;
 update public.ae_take_questions set status='settled',correct_option_id=p_option_id,settled_at=now() where id=p_question_id;
 update public.ae_take_predictions set awarded_points=case when option_id=p_option_id then q.points else 0 end where question_id=p_question_id;
 select count(*) into winners from public.ae_take_predictions where question_id=p_question_id and option_id=p_option_id;
 return winners;
end $$;
create function public.ae_void_take(p_question_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_question_id::text));
 update public.ae_take_questions set status='void' where id=p_question_id and status='open';
 if not found then raise exception 'Take no anulable'; end if;
 return true;
end $$;
create function public.ae_take_leaderboard(p_scope text default 'general')
returns table(username text,points bigint,hits bigint,played bigint)
language sql stable security definer set search_path='' as $$
 with s as(
 select p.user_id,sum(p.awarded_points)::bigint as points,
 count(*) filter(where p.awarded_points>0)::bigint as hits,count(*)::bigint as played
 from public.ae_take_predictions p join public.ae_take_questions q on q.id=p.question_id
 where q.status='settled' and (p_scope='general' or (p_scope='weekly' and q.period='weekly'
 and date_trunc('week',q.closes_at at time zone 'UTC')=date_trunc('week',now() at time zone 'UTC')))
 group by p.user_id)
 select coalesce(nullif(left(u.raw_user_meta_data->>'username',30),''),'Aficionado '||left(s.user_id::text,6))::text as username,
 s.points,s.hits,s.played
 from s join auth.users u on u.id=s.user_id
 order by s.points desc,s.hits desc,username asc limit 25;
$$;
revoke all on function public.ae_create_take(text,text,text,timestamptz,int,text[]) from public,anon,authenticated;
revoke all on function public.ae_submit_take(uuid,uuid) from public,anon,authenticated;
revoke all on function public.ae_settle_take(uuid,uuid) from public,anon,authenticated;
revoke all on function public.ae_void_take(uuid) from public,anon,authenticated;
revoke all on function public.ae_take_leaderboard(text) from public,anon,authenticated;
grant execute on function public.ae_create_take(text,text,text,timestamptz,int,text[]) to authenticated;
grant execute on function public.ae_submit_take(uuid,uuid) to authenticated;
grant execute on function public.ae_settle_take(uuid,uuid) to authenticated;
grant execute on function public.ae_void_take(uuid) to authenticated;
grant execute on function public.ae_take_leaderboard(text) to anon,authenticated;
notify pgrst,'reload schema';