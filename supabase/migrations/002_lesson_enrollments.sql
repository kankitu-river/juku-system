-- 生徒の授業登録テーブル
create table if not exists lesson_enrollments (
  id uuid primary key default uuid_generate_v4(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (lesson_id, student_id)
);

alter table lesson_enrollments enable row level security;

create policy "Authenticated users can read all" on lesson_enrollments
  for select to authenticated using (true);
create policy "Authenticated users can write" on lesson_enrollments
  for all to authenticated using (true) with check (true);
