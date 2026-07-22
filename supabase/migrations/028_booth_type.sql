alter table booths
  add column if not exists booth_type text not null default 'individual'
  check (booth_type in ('individual', 'group_preferred'));
