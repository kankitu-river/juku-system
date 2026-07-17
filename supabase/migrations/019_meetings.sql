-- 議事録テーブル
create table if not exists meeting_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  meeting_date date not null,
  raw_text text not null default '',
  summary text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 議事録から抽出されたタスク
create table if not exists meeting_tasks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meeting_notes(id) on delete cascade,
  title text not null,
  assignee text,
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now()
);

-- RLS
alter table meeting_notes enable row level security;
alter table meeting_tasks enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'meeting_notes' and policyname = 'authenticated can manage meeting_notes'
  ) then
    execute 'create policy "authenticated can manage meeting_notes" on meeting_notes for all to authenticated using (true) with check (true)';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'meeting_tasks' and policyname = 'authenticated can manage meeting_tasks'
  ) then
    execute 'create policy "authenticated can manage meeting_tasks" on meeting_tasks for all to authenticated using (true) with check (true)';
  end if;
end $$;

-- updated_at トリガー
create or replace function update_meeting_notes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger meeting_notes_updated_at
  before update on meeting_notes
  for each row execute function update_meeting_notes_updated_at();
