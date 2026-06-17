# 塾スケジュール管理システム — CLAUDE.md

## プロジェクト概要

中規模の学習塾（先生4〜10人、生徒50〜200人）向けのスケジュール管理Webアプリケーション。
PCとスマホの両方に対応したレスポンシブデザイン。塾のスタッフ・先生のみが使用する管理ツール。

---

## 技術スタック

| レイヤー | 採用技術 | 理由 |
|---|---|---|
| フロントエンド | Next.js 14 (App Router) + TypeScript | フルスタック、SSR対応、Claude Codeとの相性が良い |
| スタイリング | Tailwind CSS | レスポンシブ対応が容易 |
| バックエンド | Next.js API Routes (Server Actions) | 別サーバー不要でシンプル |
| データベース | Supabase (PostgreSQL) | BaaS、認証・リアルタイム機能が内蔵 |
| 認証 | Supabase Auth | メール+パスワード認証、ロール管理 |
| ホスティング | Vercel | Next.jsとの相性が最良 |
| 印刷・PDF | react-to-print + @react-pdf/renderer | 印刷レイアウト生成 |
| メール送信 | Resend | アンケートリンク配信 |

---

## 認証・権限

- **管理者アカウント**：初期セットアップ時に1つ作成（塾長・管理責任者）
- **スタッフアカウント**：管理者が必要に応じて追加可能
- **ロール**：`admin`（全操作可）／`staff`（閲覧・基本操作）
- 認証はSupabase Authのメール+パスワード方式を使用

---

## 時間割マスタ定義

### 通常授業期間（講習期間以外）

個別指導（月〜金）：
- 第1コマ：16:30〜18:00
- 第2コマ：18:10〜19:40
- 第3コマ：19:50〜21:20

集団授業（土曜日のみ）：
- 第1コマ：16:30〜17:30
- 第2コマ：17:40〜18:40
- 第3コマ：18:50〜19:50

### 講習期間（夏・冬・春）

全曜日共通：
- 第1コマ：09:30〜11:00
- 第2コマ：11:10〜12:40
- 第3コマ：13:10〜14:40
- 第4コマ：14:50〜16:20
- 第5コマ：16:30〜18:00
- 第6コマ：18:10〜19:40
- 第7コマ：19:50〜21:20

**実装方針**：
- `term_types` テーブルで「通常期間」「講習期間」を管理し、期間の日付範囲を登録する
- コマ作成時に対象期間を参照して、使用可能な時間帯スロットを自動的に絞り込む
- 時間帯スロットは定数としてコード内に定義し、DB参照は不要

---

## 機能要件（優先順位順）

### Phase 1 — MVP：授業・コマのスケジュール管理

- 週次カレンダービューでコマを表示（集団授業・個別指導を色で区別）
- コマの作成・編集・削除（科目、担当講師、時間帯、教室/ブース、定員）
- 集団授業（土曜のみ）と個別指導（月〜金）の授業形式を区別して管理
- 期間区分（通常期間・講習期間）の設定と、それに応じた時間帯スロットの自動切り替え
- 月次・週次・日次ビューの切り替え

### Phase 2 — 先生のシフト管理

- 毎月の出勤可能日アンケート機能（詳細はPhase 6参照）
- シフト表の作成・編集（週単位）
- シフトとコマの担当割り当ての紐付け
- 先生の空き時間一覧表示

### Phase 3 — 生徒の出欠・振替管理

- 生徒マスタ（名前、学年、受講科目、相性情報）
- コマごとの出欠記録（出席・欠席・振替）
- **出欠入力時の振替確認フロー**：
  1. 生徒を「欠席」にマークする
  2. 「振替コマを追加しますか？」の確認ダイアログを表示
  3. 「はい」→ 振替クレジットが自動で1加算される
  4. 「いいえ」→ 欠席のみ記録（振替なし）
- **振替ルール**：
  - 振替クレジット残数を生徒ごとに管理
  - 振替利用時は先生が空きコマを確認して手動割り当て
  - 振替割り当て画面でおすすめ先生を表示（Phase 7参照）
- 出欠履歴の閲覧

### Phase 4 — ブース（机）割り当て管理

- **個別指導ブース**：全13ブースを管理
  - 各コマに対して講師をブースに割り当てる
  - 生徒はブース内で自由着席（席の細かい管理は不要）
  - ブースの使用状況をコマ単位で可視化
- **集団授業**：教室単位で管理（固定席のため座席管理は不要）
- コマ一覧画面でブース使用状況を一目で確認できる

### Phase 5 — イベント・講習会管理

- 通常コマとは別にイベント・講習会を登録
- 開催日時・場所・担当講師・参加生徒の管理
- カレンダーへのイベント表示

### Phase 6 — 出勤可能日アンケート機能

- 毎月、管理者がアンケートを作成し、全先生にメールでリンクを一斉送信
- 先生はリンクからログイン不要でアンケートページにアクセス（トークン認証）
- カレンダー形式のUIで出勤可能日を選択・送信
- 回答がシステムに自動反映され、シフト候補として使用できる
- 回答状況（未回答・回答済み）を管理者が一覧で確認できる

**実装方針**：
- `shift_surveys` テーブルで月次アンケートを管理
- `shift_survey_tokens` テーブルで先生ごとのワンタイムトークン（有効期限付き）を発行
- メール送信はResendを使用、URLに `?token=xxx` を付与
- トークン照合成功後、その先生のカレンダー選択UIを表示

### Phase 7 — 先生・生徒プロフィール＆振替おすすめ機能

- **先生プロフィール**：
  - 担当可能科目の登録（例：数学・英語・物理など）
  - 得意学年の登録
- **生徒プロフィール**：
  - 受講科目の登録
  - 相性がいい先生（「任せたい先生」）の登録（複数可）
  - NGの先生の登録（複数可）
- **振替おすすめロジック**：
  - 振替コマ割り当て時に、候補となる先生を以下の条件でスコアリングして表示
    1. ✅ 生徒の受講科目を教えられる
    2. ✅ 対象コマの時間帯にシフトが入っている
    3. ✅ ブースに空きがある
    4. ⭐ 「任せたい先生」リストに含まれる（優先表示）
    5. ❌ NGリストの先生は非表示

### Phase 8 — 印刷・PDF出力機能

#### 8-1. 週間スケジュール印刷
- 1週間分の全コマを一覧表示したレイアウトをA4横向きで印刷
- 印刷用CSSで画面表示と異なるレイアウトを適用

#### 8-2. 日次スケジュール印刷
- 1日分のコマ・ブース割り当て・担当講師をA4縦向きで印刷
- 印刷時に当日の出欠状況も含める

#### 8-3. 月次個人スケジュール配布
- **先生向け**：その月に担当するコマ一覧をPDFで出力（先生1人につき1ファイル）
- **生徒向け**：その月に受講するコマ一覧をPDFで出力（生徒1人につき1ファイル）
- 管理画面から対象月・対象者を選択して一括生成・ダウンロード
- PDF内には氏名・月・コマ日時・科目・担当講師（生徒向けのみ）を記載

---

## データモデル（主要テーブル）

```sql
-- 先生
teachers (
  id, name, email, role,
  subjects TEXT[],        -- 担当可能科目リスト
  grade_levels TEXT[],    -- 得意学年リスト
  created_at
)

-- 生徒
students (
  id, name, grade,
  subjects TEXT[],                  -- 受講科目
  preferred_teacher_ids UUID[],     -- 任せたい先生
  ng_teacher_ids UUID[],            -- NGの先生
  created_at
)

-- 期間区分（通常期間・講習期間）
term_periods (
  id, name,               -- 例: '2025年夏期講習'
  type,                   -- 'regular' | 'intensive'
  start_date, end_date,
  created_at
)

-- コマ定義
lessons (
  id, title, type,        -- type: 'group' | 'individual'
  teacher_id, day_of_week,
  slot_index,             -- 時間帯スロット番号（1〜7）
  term_type,              -- 'regular' | 'intensive'
  booth_id,               -- 個別指導のみ
  subject,
  capacity, created_at
)

-- ブース
booths (id, name, is_active)  -- 13ブース

-- 出欠記録
attendances (
  id, student_id, lesson_id,
  date, status,           -- 'present' | 'absent' | 'makeup_used'
  makeup_credited,        -- 欠席時に振替クレジットを付与したか boolean
  created_at
)

-- 振替管理
makeup_credits (
  id, student_id,
  total_credits, used_credits,
  updated_at
)

-- 振替コマ割り当て
makeup_assignments (
  id, student_id, lesson_id,
  assigned_date, assigned_by,
  created_at
)

-- シフト
shifts (
  id, teacher_id,
  date, start_time, end_time,
  created_at
)

-- 月次出勤アンケート
shift_surveys (
  id, target_month,       -- 例: '2025-08'
  created_by, created_at,
  deadline
)

-- アンケートトークン（先生ごと）
shift_survey_tokens (
  id, survey_id, teacher_id,
  token TEXT UNIQUE,
  expires_at,
  responded_at            -- NULL = 未回答
)

-- アンケート回答（出勤可能日）
shift_survey_responses (
  id, token_id, teacher_id,
  available_dates DATE[],
  submitted_at
)

-- イベント
events (
  id, title, description,
  start_at, end_at,
  teacher_id, created_at
)
```

---

## 時間帯スロット定数（コード内定義）

```typescript
// lib/constants/timeSlots.ts

export const REGULAR_SLOTS = [
  { index: 1, start: '16:30', end: '18:00' },
  { index: 2, start: '18:10', end: '19:40' },
  { index: 3, start: '19:50', end: '21:20' },
]

export const INTENSIVE_SLOTS = [
  { index: 1, start: '09:30', end: '11:00' },
  { index: 2, start: '11:10', end: '12:40' },
  { index: 3, start: '13:10', end: '14:40' },
  { index: 4, start: '14:50', end: '16:20' },
  { index: 5, start: '16:30', end: '18:00' },
  { index: 6, start: '18:10', end: '19:40' },
  { index: 7, start: '19:50', end: '21:20' },
]

// 集団授業（土曜日）は通常期間のみ
export const GROUP_SATURDAY_SLOTS = [
  { index: 1, start: '16:30', end: '17:30' },
  { index: 2, start: '17:40', end: '18:40' },
  { index: 3, start: '18:50', end: '19:50' },
]
```

---

## 画面構成

```
/                          # ダッシュボード（今日のコマ・お知らせ）
/login                     # ログイン

/schedule                  # 週次カレンダー（メイン画面）
/schedule/new              # コマ作成
/schedule/[id]             # コマ詳細・編集
/schedule/print/week       # 週間スケジュール印刷プレビュー
/schedule/print/day        # 日次スケジュール印刷プレビュー

/attendance                # 出欠管理トップ
/attendance/[lessonId]     # コマ別出欠入力（欠席時に振替確認ダイアログ）
/attendance/makeup         # 振替一覧・割り当て（おすすめ先生表示）

/teachers                  # 先生一覧
/teachers/[id]             # 先生詳細・プロフィール・シフト

/shifts                    # シフト管理（週次）
/shifts/survey             # 月次アンケート管理（作成・送信・回答状況確認）
/shifts/survey/respond     # 先生のアンケート回答ページ（トークン認証）

/students                  # 生徒一覧
/students/[id]             # 生徒詳細・プロフィール・出欠履歴・振替残数

/booths                    # ブース管理・使用状況確認

/events                    # イベント・講習会一覧
/events/new                # イベント作成
/events/[id]               # イベント詳細・編集

/print/monthly             # 月次個人スケジュールPDF生成（先生・生徒選択）

/settings                  # 管理者設定・アカウント管理・期間区分管理
```

---

## UI・デザイン方針

- **配色**：落ち着いたネイビー（#1E3A5F）をメインカラー、アクセントにアンバー（#F59E0B）
- 集団授業と個別指導はカレンダー上で色分け表示
- スマホでも操作しやすい大きめのタップターゲット（44px以上）
- 出欠入力はワンタップで完結できるシンプルなUI
- **振替確認ダイアログ**：欠席登録直後にモーダル表示（「振替を追加する」「追加しない」の2択）
- **おすすめ先生表示**：⭐マークで任せたい先生を強調、NGは非表示

---

## 開発上の注意事項

- **振替ロジック**：欠席登録と振替クレジットの加算はSupabaseのトランザクション（RPC）で処理すること
- **ブース競合チェック**：同一コマ・同一ブースに複数講師が割り当てられないようバリデーションを実装
- **シフトとコマの整合性**：先生が担当するコマはシフト内に収まっているか警告表示
- **アンケートトークン**：有効期限（締め切り日）を過ぎたトークンはアクセス拒否
- **印刷レイアウト**：`@media print` CSSでナビゲーション等を非表示にし、印刷専用レイアウトを適用
- **月次PDF一括生成**：生徒・先生が多い場合はサーバーサイドで逐次生成しZIPでダウンロード
- Supabase Row Level Security (RLS) を有効化し、認証済みユーザーのみデータアクセス可能にする（アンケートページはトークン照合APIのみ公開）
- 環境変数は `.env.local` で管理
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `RESEND_API_KEY`
  - `NEXT_PUBLIC_BASE_URL`（アンケートリンク生成用）

---

## ディレクトリ構成（推奨）

```
/
├── app/
│   ├── (auth)/login/
│   ├── (dashboard)/
│   │   ├── schedule/
│   │   ├── attendance/
│   │   ├── teachers/
│   │   ├── shifts/
│   │   ├── students/
│   │   ├── booths/
│   │   ├── events/
│   │   └── print/
│   ├── survey/respond/    # トークン認証アンケートページ（認証不要）
│   └── api/
│       ├── survey/        # アンケートトークン照合・回答受付
│       └── print/         # PDF生成エンドポイント
├── components/
│   ├── ui/
│   ├── schedule/
│   ├── attendance/
│   ├── print/             # 印刷・PDF用コンポーネント
│   ├── survey/            # アンケートUI
│   └── layout/
├── lib/
│   ├── supabase/
│   ├── email/             # Resendメール送信
│   ├── pdf/               # PDF生成ロジック
│   └── constants/
│       └── timeSlots.ts   # 時間帯スロット定数
├── types/
└── supabase/
    └── migrations/
```

---

## 初期セットアップ手順（Claude Codeへの指示）

1. `npx create-next-app@latest` でプロジェクト作成（TypeScript・Tailwind・App Router有効）
2. 追加パッケージをインストール：
   ```bash
   npm install @supabase/supabase-js @supabase/ssr resend react-to-print @react-pdf/renderer
   ```
3. Supabaseプロジェクトを作成し、環境変数を設定
4. `supabase/migrations/` 配下にテーブル作成SQLを配置して実行
5. Supabase AuthのEmail認証を有効化し、管理者アカウントを初期登録
6. `lib/constants/timeSlots.ts` に時間帯スロット定数を定義
7. Phase 1（スケジュール管理）から実装開始
