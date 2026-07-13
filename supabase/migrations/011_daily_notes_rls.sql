alter table daily_notes enable row level security;

drop policy if exists "authenticated_all_daily_notes" on daily_notes;
create policy "authenticated_all_daily_notes"
  on daily_notes
  for all
  to authenticated
  using (true)
  with check (true);
