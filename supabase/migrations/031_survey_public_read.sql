-- 公開アンケート回答ページ（未ログインの先生がスマホ等でアクセス）向けの読み取りRPC。
--
-- 背景: app/survey/respond/page.tsx はトークン照合を security definer RPC で行うが、
-- その後のアンケート本体・回答・休校日・講習期間の取得は通常のRLSクエリだった。
-- これらのテーブルのSELECTポリシーは `to authenticated` のみのため、未ログイン(anon)の
-- 先生はデータを読めず「アンケートが見つかりません」になっていた（管理者はログイン済みの
-- PCでは読めるため症状がPC/スマホで分かれていた）。
--
-- 対策: トークン照合(013)と同じく、必要な読み取りだけを security definer RPC 経由で
-- anon に許可する。全行公開ポリシーは追加しない（survey_id を知っている＝リンク保持者のみ）。

-- 既存マイグレーションに shift_surveys.term_type 追加が無い（コードが依存し本番には存在）ため整合を取る
alter table shift_surveys add column if not exists term_type text not null default 'regular';

-- アンケート本体（id指定）
create or replace function get_survey_public(p_survey_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(s) from shift_surveys s where s.id = p_survey_id
$$;
grant execute on function get_survey_public(uuid) to anon, authenticated;

-- アンケートに紐づく全回答（先生ごとの既回答プリフィル用）
create or replace function get_survey_responses_public(p_survey_id uuid)
returns table (
  teacher_id uuid,
  available_slots jsonb,
  maybe_slots jsonb,
  ng_reasons text[],
  ng_reason_note text
)
language sql
security definer
set search_path = public
as $$
  select r.teacher_id, r.available_slots, r.maybe_slots, r.ng_reasons, r.ng_reason_note
  from shift_survey_responses r
  join shift_survey_tokens t on t.id = r.token_id
  where t.survey_id = p_survey_id
$$;
grant execute on function get_survey_responses_public(uuid) to anon, authenticated;

-- 対象月の休校日
create or replace function get_closures_public(p_target_month text)
returns table (date date)
language sql
security definer
set search_path = public
as $$
  select c.date
  from school_closures c
  where c.date >= (p_target_month || '-01')::date
    and c.date < ((p_target_month || '-01')::date + interval '1 month')
$$;
grant execute on function get_closures_public(text) to anon, authenticated;

-- 講習期間（term_period_id 指定時はその期間のみ、null時は全intensive期間）
create or replace function get_intensive_periods_public(p_term_period_id uuid)
returns table (start_date date, end_date date)
language sql
security definer
set search_path = public
as $$
  select tp.start_date, tp.end_date
  from term_periods tp
  where (p_term_period_id is not null and tp.id = p_term_period_id)
     or (p_term_period_id is null and tp.type = 'intensive')
  order by tp.start_date
$$;
grant execute on function get_intensive_periods_public(uuid) to anon, authenticated;

-- 特定先生の前回（同一term_type）回答の available_slots（差分警告用）
create or replace function get_teacher_prev_response_public(
  p_teacher_id uuid,
  p_current_survey_id uuid,
  p_term_type text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select r.available_slots
  from shift_survey_responses r
  join shift_survey_tokens t on t.id = r.token_id
  join shift_surveys s on s.id = t.survey_id
  where t.teacher_id = p_teacher_id
    and t.responded_at is not null
    and s.id <> p_current_survey_id
    and coalesce(s.term_type, 'regular') = p_term_type
  order by r.submitted_at desc
  limit 1
$$;
grant execute on function get_teacher_prev_response_public(uuid, uuid, text) to anon, authenticated;
