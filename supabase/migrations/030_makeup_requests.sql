-- 振替台帳（スケ組みソフトの「授業振替」「授業振替終了済み」シートの取り込み先）
-- Excelの1行=1振替。既存の makeup_credits(残数) / makeup_assignments(実在コマ割当) では
-- 元欠席授業・希望日テキスト・未定/決定・備考 を保持できないため専用テーブルを新設する。
create table if not exists makeup_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete set null,
  student_name text not null,                 -- 元Excelの氏名（名簿未一致でも保持）
  received_date date,                          -- 受付日時
  original_lesson text not null default '',    -- 授業日時（"夏期講習"等の文字列もあるためtext。日付ならYYYY-MM-DD）
  subject text not null default '',            -- 教科
  desired_raw text not null default '',        -- 振替希望日時（生テキスト）
  scheduled_date date,                         -- 決定日（パースできたもの。best-effort）
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'completed')),
  next_test_date text not null default '',     -- 次回定期テスト日
  notes text not null default '',              -- 備考
  source_sheet text not null,                  -- '授業振替' | '授業振替終了済み'
  created_at timestamptz not null default now()
);

create index if not exists idx_makeup_requests_student on makeup_requests(student_id);
create index if not exists idx_makeup_requests_status on makeup_requests(status);

alter table makeup_requests enable row level security;

drop policy if exists "authenticated_all_makeup_requests" on makeup_requests;
create policy "authenticated_all_makeup_requests"
  on makeup_requests
  for all
  to authenticated
  using (true)
  with check (true);
