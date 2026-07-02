create table if not exists daily_notes (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  content text not null default '',
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at 自動更新
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_daily_notes_updated_at on daily_notes;
create trigger trg_daily_notes_updated_at
  before update on daily_notes
  for each row execute function set_updated_at();
