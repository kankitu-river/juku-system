-- P1-1: アンケート回答保存のアトミック化
-- available_slots列が未追加の場合のみ追加（001ではavailable_datesで定義したが実装はJSONB形式に移行済み）
alter table shift_survey_responses add column if not exists available_slots jsonb;

-- delete → insert → update の3ステップをトランザクション化し、insert失敗時の回答消失を防ぐ
create or replace function submit_survey_response(
  p_survey_id  uuid,
  p_teacher_id uuid,
  p_available_slots jsonb
)
returns void
language plpgsql
security definer
as $$
declare
  v_token_id   uuid;
  v_expires_at timestamptz;
begin
  select id, expires_at into v_token_id, v_expires_at
  from shift_survey_tokens
  where survey_id = p_survey_id and teacher_id = p_teacher_id;

  if v_token_id is null then
    raise exception 'Token not found';
  end if;

  if v_expires_at < now() then
    raise exception 'Token expired';
  end if;

  delete from shift_survey_responses where token_id = v_token_id;

  insert into shift_survey_responses (token_id, teacher_id, available_slots, submitted_at)
  values (v_token_id, p_teacher_id, p_available_slots, now());

  update shift_survey_tokens set responded_at = now() where id = v_token_id;
end;
$$;

grant execute on function submit_survey_response(uuid, uuid, jsonb) to anon, authenticated;
