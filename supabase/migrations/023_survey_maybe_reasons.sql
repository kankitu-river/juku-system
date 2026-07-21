alter table shift_survey_responses
  add column if not exists maybe_reasons text[] not null default '{}',
  add column if not exists maybe_reason_note text not null default '';

create or replace function submit_survey_response(
  p_survey_id          uuid,
  p_teacher_id         uuid,
  p_available_slots    jsonb,
  p_maybe_slots        jsonb    default '{}',
  p_ng_reasons         text[]   default '{}',
  p_ng_reason_note     text     default '',
  p_maybe_reasons      text[]   default '{}',
  p_maybe_reason_note  text     default ''
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

  insert into shift_survey_responses (
    token_id, teacher_id, available_slots, maybe_slots,
    ng_reasons, ng_reason_note, maybe_reasons, maybe_reason_note,
    submitted_at
  ) values (
    v_token_id, p_teacher_id, p_available_slots, p_maybe_slots,
    p_ng_reasons, p_ng_reason_note, p_maybe_reasons, p_maybe_reason_note,
    now()
  );

  update shift_survey_tokens set responded_at = now() where id = v_token_id;
end;
$$;

grant execute on function submit_survey_response(uuid, uuid, jsonb, jsonb, text[], text, text[], text) to anon, authenticated;
