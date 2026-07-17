-- タスクテンプレート（繰り返しルール）
create table if not exists task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  recurrence_type text not null check (recurrence_type in ('monthly', 'weekly')),
  recurrence_day_of_month int check (recurrence_day_of_month between 1 and 28),
  recurrence_day_of_week int check (recurrence_day_of_week between 0 and 6),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table task_templates enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'task_templates' and policyname = 'Auth users manage task_templates'
  ) then
    execute 'create policy "Auth users manage task_templates" on task_templates for all to authenticated using (true) with check (true)';
  end if;
end $$;

-- タスクインスタンス
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references task_templates(id) on delete set null,
  title text not null,
  description text,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_tasks_due_date on tasks(due_date);
create index if not exists idx_tasks_status on tasks(status);

alter table tasks enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'tasks' and policyname = 'Auth users manage tasks'
  ) then
    execute 'create policy "Auth users manage tasks" on tasks for all to authenticated using (true) with check (true)';
  end if;
end $$;

-- デフォルトテンプレート（冪等）
insert into task_templates (title, description, recurrence_type, recurrence_day_of_month)
select * from (values
  ('出勤アンケート作成・送信', '翌月のシフト確認アンケートを作成し、先生に送付する', 'monthly', 20),
  ('月次スケジュール確認', '翌月の授業スケジュールに問題がないか確認する', 'monthly', 25),
  ('振替未確定チェック', '未確定の振替クレジットを持つ生徒を確認し、担当者と調整する', 'monthly', 1)
) as v(title, description, recurrence_type, recurrence_day_of_month)
where not exists (select 1 from task_templates limit 1);
