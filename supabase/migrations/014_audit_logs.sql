-- 監査ログテーブル（操作履歴 + Undo用スナップショット）
create table if not exists audit_logs (
  id              uuid primary key default gen_random_uuid(),
  table_name      text not null,
  record_id       uuid not null,
  action          text not null check (action in ('create', 'update', 'delete', 'undo')),
  before_snapshot jsonb,
  after_snapshot  jsonb,
  undone_log_id   uuid references audit_logs(id),
  summary         text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_audit_logs_record  on audit_logs(table_name, record_id);
create index if not exists idx_audit_logs_created on audit_logs(created_at desc);

alter table audit_logs enable row level security;
create policy "Authenticated users can manage audit_logs"
  on audit_logs for all to authenticated using (true) with check (true);
