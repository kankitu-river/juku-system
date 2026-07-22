-- M3-2: 保護者要望メモ
alter table students
  add column if not exists parent_requests text not null default '';
