-- 講師×生徒の同時指導制約ルール
create table if not exists pairing_rules (
  id uuid primary key default gen_random_uuid(),
  rule_type text not null check (rule_type in ('grade_gap', 'same_subject_only', 'max_students')),
  params jsonb not null default '{}',
  severity text not null default 'warn' check (severity in ('warn', 'block')),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table pairing_rules enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'pairing_rules' and policyname = 'Auth users manage pairing_rules'
  ) then
    execute 'create policy "Auth users manage pairing_rules" on pairing_rules for all to authenticated using (true) with check (true)';
  end if;
end $$;

-- デフォルトルール例（冪等）
insert into pairing_rules (rule_type, params, severity, description)
select 'grade_gap', '{"max_gap": 5}', 'warn', '学年差が5以上の生徒の同時指導は警告'
where not exists (select 1 from pairing_rules where rule_type = 'grade_gap');
