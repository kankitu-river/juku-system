create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  position int not null default 1,
  status text not null default 'waiting' check (status in ('waiting', 'promoted', 'cancelled')),
  notes text,
  promoted_at timestamptz,
  created_at timestamptz not null default now()
);

-- 同一レッスンに同じ生徒が複数 waiting できない
create unique index if not exists waitlist_active_unique
  on waitlist(lesson_id, student_id) where status = 'waiting';

create index if not exists idx_waitlist_lesson on waitlist(lesson_id, status, position);

alter table waitlist enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'waitlist' and policyname = 'Auth users manage waitlist'
  ) then
    execute 'create policy "Auth users manage waitlist" on waitlist for all to authenticated using (true) with check (true)';
  end if;
end $$;
