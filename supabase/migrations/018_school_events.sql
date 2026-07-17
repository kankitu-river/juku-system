-- 学校行事カレンダー（定期テスト・行事など）
create table if not exists school_events (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  event_type text not null check (event_type in ('定期テスト', '行事', '休校', 'その他')),
  title text not null,
  start_date date not null,
  end_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_school_events_dates on school_events(start_date, end_date);

alter table school_events enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'school_events' and policyname = 'Auth users manage school_events'
  ) then
    execute 'create policy "Auth users manage school_events" on school_events for all to authenticated using (true) with check (true)';
  end if;
end $$;

-- 生徒テーブルに school_name カラムを追加
alter table students add column if not exists school_name text;
