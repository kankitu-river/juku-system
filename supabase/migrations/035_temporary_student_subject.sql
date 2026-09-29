-- 臨時参加の生徒にも科目を持たせる（表示・記録用）
alter table temporary_students
  add column if not exists subject text not null default '';
