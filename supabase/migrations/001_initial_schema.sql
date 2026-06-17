-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- 先生テーブル
-- ============================================================
create table if not exists teachers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text unique not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  subjects text[] not null default '{}',
  grade_levels text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ============================================================
-- 生徒テーブル
-- ============================================================
create table if not exists students (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  grade text not null,
  subjects text[] not null default '{}',
  preferred_teacher_ids uuid[] not null default '{}',
  ng_teacher_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ============================================================
-- 期間区分テーブル
-- ============================================================
create table if not exists term_periods (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null check (type in ('regular', 'intensive')),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint term_periods_date_check check (start_date <= end_date)
);

-- ============================================================
-- ブーステーブル（個別指導ブース 13席）
-- ============================================================
create table if not exists booths (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  is_active boolean not null default true
);

-- 初期データ: 13ブース
insert into booths (name) values
  ('ブース1'), ('ブース2'), ('ブース3'), ('ブース4'), ('ブース5'),
  ('ブース6'), ('ブース7'), ('ブース8'), ('ブース9'), ('ブース10'),
  ('ブース11'), ('ブース12'), ('ブース13')
on conflict do nothing;

-- ============================================================
-- コマ（授業スロット）テーブル
-- ============================================================
create table if not exists lessons (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  type text not null check (type in ('group', 'individual')),
  teacher_id uuid references teachers(id) on delete set null,
  day_of_week integer not null check (day_of_week between 1 and 6),
  slot_index integer not null check (slot_index between 1 and 7),
  term_type text not null check (term_type in ('regular', 'intensive')),
  booth_id uuid references booths(id) on delete set null,
  subject text not null default '',
  capacity integer not null default 1,
  created_at timestamptz not null default now()
);

-- ブース競合防止: 同一曜日・スロット・ブースに複数コマ不可
create unique index if not exists lessons_booth_slot_unique
  on lessons (day_of_week, slot_index, term_type, booth_id)
  where booth_id is not null;

-- ============================================================
-- 出欠記録テーブル
-- ============================================================
create table if not exists attendances (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  date date not null,
  status text not null check (status in ('present', 'absent', 'makeup_used')),
  makeup_credited boolean not null default false,
  created_at timestamptz not null default now(),
  unique (student_id, lesson_id, date)
);

-- ============================================================
-- 振替クレジットテーブル
-- ============================================================
create table if not exists makeup_credits (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null unique references students(id) on delete cascade,
  total_credits integer not null default 0,
  used_credits integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 振替コマ割り当てテーブル
-- ============================================================
create table if not exists makeup_assignments (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  assigned_date date not null,
  assigned_by uuid references teachers(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- シフトテーブル
-- ============================================================
create table if not exists shifts (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  unique (teacher_id, date)
);

-- ============================================================
-- 月次出勤アンケートテーブル
-- ============================================================
create table if not exists shift_surveys (
  id uuid primary key default uuid_generate_v4(),
  target_month text not null, -- 例: '2025-08'
  created_by uuid references teachers(id) on delete set null,
  deadline date not null,
  created_at timestamptz not null default now()
);

create table if not exists shift_survey_tokens (
  id uuid primary key default uuid_generate_v4(),
  survey_id uuid not null references shift_surveys(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  responded_at timestamptz
);

create table if not exists shift_survey_responses (
  id uuid primary key default uuid_generate_v4(),
  token_id uuid not null references shift_survey_tokens(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  available_dates date[] not null default '{}',
  submitted_at timestamptz not null default now()
);

-- ============================================================
-- イベントテーブル
-- ============================================================
create table if not exists events (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  teacher_id uuid references teachers(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RLS (Row Level Security) 有効化
-- ============================================================
alter table teachers enable row level security;
alter table students enable row level security;
alter table term_periods enable row level security;
alter table booths enable row level security;
alter table lessons enable row level security;
alter table attendances enable row level security;
alter table makeup_credits enable row level security;
alter table makeup_assignments enable row level security;
alter table shifts enable row level security;
alter table shift_surveys enable row level security;
alter table shift_survey_tokens enable row level security;
alter table shift_survey_responses enable row level security;
alter table events enable row level security;

-- 認証済みユーザーはすべてのデータにアクセス可能
create policy "Authenticated users can read all" on teachers for select to authenticated using (true);
create policy "Authenticated users can write" on teachers for all to authenticated using (true) with check (true);

create policy "Authenticated users can read all" on students for select to authenticated using (true);
create policy "Authenticated users can write" on students for all to authenticated using (true) with check (true);

create policy "Authenticated users can read all" on term_periods for select to authenticated using (true);
create policy "Authenticated users can write" on term_periods for all to authenticated using (true) with check (true);

create policy "Authenticated users can read all" on booths for select to authenticated using (true);
create policy "Authenticated users can write" on booths for all to authenticated using (true) with check (true);

create policy "Authenticated users can read all" on lessons for select to authenticated using (true);
create policy "Authenticated users can write" on lessons for all to authenticated using (true) with check (true);

create policy "Authenticated users can read all" on attendances for select to authenticated using (true);
create policy "Authenticated users can write" on attendances for all to authenticated using (true) with check (true);

create policy "Authenticated users can read all" on makeup_credits for select to authenticated using (true);
create policy "Authenticated users can write" on makeup_credits for all to authenticated using (true) with check (true);

create policy "Authenticated users can read all" on makeup_assignments for select to authenticated using (true);
create policy "Authenticated users can write" on makeup_assignments for all to authenticated using (true) with check (true);

create policy "Authenticated users can read all" on shifts for select to authenticated using (true);
create policy "Authenticated users can write" on shifts for all to authenticated using (true) with check (true);

create policy "Authenticated users can read all" on shift_surveys for select to authenticated using (true);
create policy "Authenticated users can write" on shift_surveys for all to authenticated using (true) with check (true);

-- アンケートトークン: 認証不要で読み取り可（回答ページ用）
create policy "Anyone can read tokens by token value" on shift_survey_tokens for select using (true);
create policy "Authenticated users can write tokens" on shift_survey_tokens for all to authenticated using (true) with check (true);

create policy "Anyone can submit response" on shift_survey_responses for insert with check (true);
create policy "Authenticated users can read responses" on shift_survey_responses for select to authenticated using (true);

create policy "Authenticated users can read all" on events for select to authenticated using (true);
create policy "Authenticated users can write" on events for all to authenticated using (true) with check (true);
