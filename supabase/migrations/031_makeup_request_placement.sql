-- 振替台帳の1件が、実際にどのコマ(lesson)・どの日に配置されたかを結ぶ。
-- これにより「コマに置いたあとの再振替（置き直し）」で前の割当・出欠を正しく消せる。
alter table makeup_requests
  add column if not exists assigned_lesson_id uuid references lessons(id) on delete set null,
  add column if not exists assigned_date date;

create index if not exists idx_makeup_requests_assigned_lesson on makeup_requests(assigned_lesson_id);
