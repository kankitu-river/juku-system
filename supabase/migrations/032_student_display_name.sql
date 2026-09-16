-- 生徒表記（スケ組みソフトの短縮名。通常授業マスターの取り込み時の名前解決に使う）
alter table students add column if not exists display_name text;

comment on column students.display_name is 'スケ組みソフトの生徒表記（短縮名）。通常授業マスターExcel取り込み時に氏名解決へ使用';

-- 表記での照合を速くする
create index if not exists students_display_name_idx on students (display_name);
