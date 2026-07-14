-- P1-2: 公開アンケートのトークン防御強化
-- "Anyone can read tokens by token value" ポリシー（全行列挙可能）を廃止し、
-- security definer RPCを通じてのみanon読み取りを許可する。

-- トークン値でのトークン照合（page.tsx: ?token=xxx URLからの照合）
create or replace function verify_survey_token(p_token text)
returns table (id uuid, survey_id uuid, teacher_id uuid, expires_at timestamptz)
language sql
security definer
as $$
  select id, survey_id, teacher_id, expires_at
  from shift_survey_tokens
  where token = p_token
$$;
grant execute on function verify_survey_token(text) to anon, authenticated;

-- アンケートに紐づく全トークン取得（先生一覧表示用）
create or replace function get_survey_tokens(p_survey_id uuid)
returns table (id uuid, teacher_id uuid, responded_at timestamptz, teacher jsonb)
language sql
security definer
as $$
  select
    sst.id,
    sst.teacher_id,
    sst.responded_at,
    case when t.id is not null
      then jsonb_build_object('id', t.id, 'name', t.name)
      else null
    end as teacher
  from shift_survey_tokens sst
  left join teachers t on t.id = sst.teacher_id
  where sst.survey_id = p_survey_id
  order by sst.teacher_id
$$;
grant execute on function get_survey_tokens(uuid) to anon, authenticated;

-- 特定先生の過去回答済みトークン取得（前回パターン差分警告用）
create or replace function get_teacher_prev_tokens(p_teacher_id uuid, p_current_survey_id uuid)
returns table (id uuid, survey_id uuid)
language sql
security definer
as $$
  select id, survey_id
  from shift_survey_tokens
  where teacher_id = p_teacher_id
    and responded_at is not null
    and survey_id <> p_current_survey_id
$$;
grant execute on function get_teacher_prev_tokens(uuid, uuid) to anon, authenticated;

-- 全行公開ポリシーを削除（RPCに移行したため不要）
drop policy if exists "Anyone can read tokens by token value" on shift_survey_tokens;
