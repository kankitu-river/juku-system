-- 講習期間は日曜も授業がありうるため、day_of_week の制約を 0〜6 に緩和する
-- （0=日曜）。既存の制約名は環境により異なるため、動的に探して張り替える。
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'lessons'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%day_of_week%'
  loop
    execute format('alter table lessons drop constraint %I', con.conname);
  end loop;

  alter table lessons add constraint lessons_day_of_week_check
    check (day_of_week between 0 and 6);
end $$;
