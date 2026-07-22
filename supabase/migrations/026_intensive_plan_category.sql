-- M3-1: 申込コマの3分類（申込/振替/特替）
alter table intensive_plans
  add column if not exists category text not null default 'applied'
  check (category in ('applied', 'makeup', 'special'));

-- 既存の unique 制約を削除し、category を含む新しい制約に差し替える
-- Supabase が自動生成する制約名パターンに合わせて試行
do $$
begin
  begin
    alter table intensive_plans
      drop constraint intensive_plans_student_id_term_period_id_subject_key;
  exception when undefined_object then null;
  end;
end $$;

create unique index if not exists uq_intensive_plans_student_term_subject_category
  on intensive_plans(student_id, term_period_id, subject, category);
