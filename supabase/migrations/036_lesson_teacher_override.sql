-- 通常コマ（毎週固定）の担当を「その日だけ別の先生」に差し替える。
-- テンプレ(lessons.teacher_id)は変えず、日付単位で上書きする。
create table if not exists lesson_teacher_overrides (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  date date not null,
  teacher_id uuid references teachers(id) on delete set null, -- null=その日は担当未定
  created_at timestamptz not null default now(),
  unique (lesson_id, date)
);

create index if not exists idx_lesson_teacher_overrides_date on lesson_teacher_overrides(date);
create index if not exists idx_lesson_teacher_overrides_lesson on lesson_teacher_overrides(lesson_id);

alter table lesson_teacher_overrides enable row level security;

drop policy if exists "authenticated_all_lesson_teacher_overrides" on lesson_teacher_overrides;
create policy "authenticated_all_lesson_teacher_overrides"
  on lesson_teacher_overrides
  for all
  to authenticated
  using (true)
  with check (true);
