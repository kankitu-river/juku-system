-- コマ単位ではなく「その日だけそのコマに臨時参加する生徒」を管理する。
-- 振替(makeup_assignments)とは別概念なので専用テーブルにする（分析・振替ロジックを汚染しない）。
create table if not exists temporary_students (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  unique (lesson_id, student_id, date)
);

create index if not exists idx_temporary_students_date on temporary_students(date);
create index if not exists idx_temporary_students_lesson on temporary_students(lesson_id);

alter table temporary_students enable row level security;

drop policy if exists "authenticated_all_temporary_students" on temporary_students;
create policy "authenticated_all_temporary_students"
  on temporary_students
  for all
  to authenticated
  using (true)
  with check (true);
