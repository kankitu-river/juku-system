# juku-system リファクタリング計画書

- 対象リポジトリ: `kankitu-river/juku-system`（ローカル: `C:\Users\kanki\juku-system`）
- 計画作成時点の基準コミット: `b3d2921`（fix: コンパクト表示のコマパネルにPS1（1対1）バッジが出ていなかった）
- 本書は**計画のみ**。実行者はこの計画書とリポジトリのコードのみを前提に作業する。
- 作業の性質: **外部から見た動作を一切変えない**内部整理。機能追加・バグ修正・仕様変更は行わない。

---

# 1. 現状理解（実行者への文脈共有）

## 1.1 アプリの概要
個別指導塾のスケジュール管理Webアプリ。Next.js (App Router) + TypeScript + Supabase (PostgreSQL) + Tailwind CSS。Vercelで運用中。**実運用されているため、動作を壊すことは許されない。**

主要ドメイン概念:
- **lesson（コマ）**: 曜日 `day_of_week`（1=月〜6=土、7=日相当）× コマ番号 `slot_index` で定義される授業。`type` が `'individual'`（個別）か `'group'`(集団)、`term_type` が `'regular'`（通常期）か `'intensive'`(講習期)。特定日のみの臨時コマもある
- **コマの時間帯**: 曜日・type・term_typeの組み合わせで時間割が変わる（平日個別3コマ、土曜個別4コマ、土曜集団3コマ、講習期7コマ）。正はすべて `lib/constants/timeSlots.ts` の定数
- **enrollment**: コマと生徒の紐付け（1コマ最大2名など）
- **shift**: 講師の出勤予定。**shift_survey**: 講師への出勤アンケート（トークン付き公開URL、`app/survey/` 配下のみ未認証アクセス可）
- **attendance / makeup**: 出欠と振替

## 1.2 構造マップ

```
app/
  (dashboard)/            認証必須の管理画面。各ディレクトリに page.tsx + actions.ts ('use server')
    page.tsx              ダッシュボード
    schedule/             週間スケジュール、コマCRUD、講習(intensive)、印刷(print/day, print/week)
    shifts/               シフト管理、アンケート発行(survey/)、手入力(manual-entry/)
    attendance/           出欠、振替(makeup/)、レポート(report/)
    students/ teachers/ booths/ events/ settings/ search/
    print/monthly/        講師/生徒別の月次カレンダー印刷
  survey/respond/         講師向け公開アンケート回答ページ（未認証）
  api/export/             CSVエクスポート、api/auth/ 認証コールバック
components/
  layout/   TopNav.tsx（現役ナビ）, Header.tsx（ページ見出し・全ページ使用）, Sidebar.tsx（後述: デッドコード）, DarkModeToggle.tsx
  schedule/ WeeklyCalendar.tsx, LessonForm.tsx, ScheduleFilter.tsx
  shifts/   WeeklyShiftTable.tsx, ShiftModal.tsx
  dashboard/ students/ ui/(Button, Card, Modal, Toast, Badge, Skeleton)
lib/
  constants/timeSlots.ts  時間帯定数の正 + getSlotsForLesson()/getSlotLabel()（解決関数も既にある）
  utils/datetime.ts       JST対応日付ユーティリティ。toDateStr() の正はここ
  utils/schedule.ts       月次展開 expandLessonsForMonth() 等
  utils/intensiveScheduler.ts  講習自動割り振りロジック
  supabase/ server.ts / client.ts / admin.ts(service_role、settings/userActions.tsのみ使用)
types/index.ts            DB行の型定義
supabase/migrations/      001〜010
proxy.ts                  認証ガード（/survey, /api/auth 等を除き認証必須）
```

## 1.3 ビルド・検証手段の現状
- `package.json` scripts: `dev` / `build` / `start` のみ。**テストなし。ESLint設定なし**
- `tsconfig.json` は `strict: true`
- 基準コミット時点で `npx tsc --noEmit` は**エラー0で通る**（これが型のベースライン）

## 1.4 洗い出した問題（優先順位順）

| # | 問題 | 根拠箇所 | 効果×リスク評価 |
|---|---|---|---|
| A | デッドコード: `components/layout/Sidebar.tsx` はどこからも import されていない（layoutは TopNav を使用） | layout.tsx / 全ファイルgrepで参照0 | 効果中・リスク極小 |
| B | `toDateStr` が lib/utils/datetime.ts に正があるのに、**8ファイルで同一実装がローカル再定義**されている。JSTバグ修正等が全箇所に波及しない状態 | 下記E2参照 | 効果大・リスク小 |
| C | 時間帯定数とterm判定の重複: `WeeklyShiftTable.tsx` がスロット時刻表と `getTermTypeForDate` をローカル再実装。設定変更時に不整合の温床 | WeeklyShiftTable.tsx:34-47, 56-59 | 効果大・リスク小 |
| D | スロット解決の三項演算子チェーンが `lib/utils/schedule.ts` 内に2回コピペされている（既存の `getSlotsForLesson()` で置換可能） | schedule.ts:39-43, 55-59 | 効果中・リスク小 |
| E | `as any` / `: any` が26箇所。tsconfigはstrictなのにキャストで型検査を無効化しており、スキーマ変更時に実行時エラーで発覚する構造 | E6参照 | 効果大・リスク中 |
| F | 環境変数を `process.env.X!` で非null断言。未設定でもビルドが通り、実行時に不明瞭なエラーになる | lib/supabase/server.ts:8-9, client.ts:5-6, admin.ts:5-6 | 効果小・リスク小 |

計画外として検出したが**本パスでは触らない**もの（§4参照）: 巨大コンポーネント（IntensivePlanner 571行、LessonForm 533行）、`select('*')` 37箇所、survey回答保存のdelete→insert非アトミック問題（これはバグ修正であり本計画のスコープ外。発見事項として報告のみ）。

---

# 2. 項目0: 安全網の構築（最初に必ず実行）

## 0-1. 作業前コミット
```bash
cd <プロジェクトルート>
git status            # 未コミット変更がないこと。あれば作業者に報告して中断
git checkout -b refactor/2026-07
git log --oneline -1  # 基準コミットを記録
```

## 0-2. ベースライン確認（変更前に必ず全部通ること）
```bash
npx tsc --noEmit      # 期待: エラー0、終了コード0
npm run build         # 期待: ビルド成功
```
`npm run build` がSupabase環境変数不足で失敗する場合は、プロジェクト直下の `.env.local`（存在するはず）がそのまま使われる。存在しなければ中断して報告。

## 0-3. テスト基盤の導入（本計画で唯一許可される依存追加）
```bash
npm install -D vitest
```
`vitest.config.ts` をプロジェクトルートに新規作成:
```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```
`package.json` の scripts に追加: `"test": "vitest run"`

## 0-4. 特性テスト（現在の動作の固定）
以下3ファイルを `tests/` に新規作成する。**期待値は現在の実装の出力をそのまま固定するもの**であり、実装を読んで期待値を"正しく"直してはならない。テスト内でのフィクスチャの `as` キャストは許可する。

### tests/datetime.test.ts
```ts
import { describe, it, expect } from 'vitest'
import { toDateStr } from '@/lib/utils/datetime'

describe('toDateStr', () => {
  it('formats local date as YYYY-MM-DD', () => {
    expect(toDateStr(new Date(2026, 6, 4))).toBe('2026-07-04')   // 月は0始まり
    expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')   // ゼロ埋め
  })
})
```

### tests/timeSlots.test.ts
```ts
import { describe, it, expect } from 'vitest'
import {
  getSlotsForLesson, getSlotLabel, getIntensiveSlotsForDay,
  REGULAR_SLOTS, SATURDAY_INDIVIDUAL_SLOTS, GROUP_SATURDAY_SLOTS, INTENSIVE_SLOTS,
} from '@/lib/constants/timeSlots'

describe('getSlotsForLesson', () => {
  it('平日個別はREGULAR_SLOTS', () => {
    expect(getSlotsForLesson('individual', 2, 'regular')).toEqual(REGULAR_SLOTS)
  })
  it('土曜個別はSATURDAY_INDIVIDUAL_SLOTS', () => {
    expect(getSlotsForLesson('individual', 6, 'regular')).toEqual(SATURDAY_INDIVIDUAL_SLOTS)
  })
  it('土曜集団はGROUP_SATURDAY_SLOTS', () => {
    expect(getSlotsForLesson('group', 6, 'regular')).toEqual(GROUP_SATURDAY_SLOTS)
  })
  it('講習期は曜日によらずINTENSIVE_SLOTS（limitsなし）', () => {
    expect(getSlotsForLesson('individual', 6, 'intensive')).toEqual(INTENSIVE_SLOTS)
  })
  it('講習期limitsで曜日別に最終コマを制限', () => {
    expect(getIntensiveSlotsForDay(6, { '6': 4 })).toHaveLength(4)
    expect(getIntensiveSlotsForDay(2, { '6': 4 })).toEqual(INTENSIVE_SLOTS)
  })
})

describe('getSlotLabel', () => {
  it('平日個別 第2コマ', () => {
    expect(getSlotLabel(2, 1, 'regular')).toBe('18:10〜19:40')
  })
  it('該当なしは空文字', () => {
    expect(getSlotLabel(9, 1, 'regular')).toBe('')
  })
})
```

### tests/schedule.test.ts
```ts
import { describe, it, expect } from 'vitest'
import { getDatesForDayOfWeek, getTermTypeForDate, expandLessonsForMonth } from '@/lib/utils/schedule'
import { toDateStr } from '@/lib/utils/datetime'
import type { Lesson, TermPeriod } from '@/types'

describe('getDatesForDayOfWeek', () => {
  it('2026年7月の土曜（dayOfWeek=6）は 4,11,18,25', () => {
    expect(getDatesForDayOfWeek(2026, 7, 6).map(toDateStr))
      .toEqual(['2026-07-04', '2026-07-11', '2026-07-18', '2026-07-25'])
  })
})

describe('getTermTypeForDate', () => {
  const periods = [
    { start_date: '2026-07-20', end_date: '2026-08-31', type: 'intensive' },
  ] as TermPeriod[]
  it('期間内はintensive、期間外はregular', () => {
    expect(getTermTypeForDate('2026-07-25', periods)).toBe('intensive')
    expect(getTermTypeForDate('2026-07-10', periods)).toBe('regular')
  })
})

describe('expandLessonsForMonth', () => {
  it('通常期の定期コマが該当曜日ぶん展開され、timeLabelが付く', () => {
    const lesson = {
      id: 'x', day_of_week: 6, slot_index: 1, type: 'individual',
      term_type: 'regular', subject: '数学',
    } as unknown as Lesson
    const out = expandLessonsForMonth([lesson], 2026, 7, [])
    expect(out).toHaveLength(4)                       // 7月の土曜4回
    expect(out[0].dateStr).toBe('2026-07-04')
    expect(out[0].timeLabel).toBe('13:10〜14:40')      // 土曜個別 第1コマ
  })
})
```

## 0-5. 完了条件（項目0）
```bash
npx vitest run     # 期待: 全テストpass
npx tsc --noEmit   # 期待: エラー0
npm run build      # 期待: 成功
git add -A && git commit -m "chore: add vitest and characterization tests (refactor item 0)"
```
※ もしいずれかのテストが**現実装で**失敗する場合、それは期待値の書き誤りなので、実装ではなく期待値を実際の出力に合わせて修正してよい（特性テストの原則）。実装は変更しない。

以降、**全項目共通の完了条件**は「`npx vitest run` 全pass ＋ `npx tsc --noEmit` エラー0 ＋ `npm run build` 成功」。項目ごとの追加条件は各項目に記す。以降これを【共通確認】と表記する。

---

# 3. 作業項目リスト（この順に実行）

## R1: デッドコード `Sidebar.tsx` の削除
- **対象**: `components/layout/Sidebar.tsx`（ファイル全体）
- **問題**: `app/(dashboard)/layout.tsx` は `TopNav` を使用しており、Sidebarはどこからも import されていない。旧ナビの残骸で、読者を混乱させる
- **変更**: 事前に参照ゼロを機械的に確認してから削除する
  ```bash
  grep -rn "layout/Sidebar" app components lib --include="*.ts" --include="*.tsx"
  # 期待: 出力0行。1行でも出たら削除せず中断して報告
  git rm components/layout/Sidebar.tsx
  ```
  ※ `Header.tsx` と `DarkModeToggle.tsx` は使用中なので**削除しない**
- **完了条件**: 【共通確認】＋ 上記grepが0行
- **リスク/戻し方**: リスク極小。`git revert <コミット>` で復元
- **依存**: 項目0

## R2: `toDateStr` のローカル再定義を `lib/utils/datetime.ts` へ集約
- **対象**（同一シグネチャ `(d: Date) => string` のローカル定義8箇所）:
  1. `app/survey/respond/page.tsx:8`
  2. `app/survey/respond/SurveyRespond.tsx:30`
  3. `app/(dashboard)/attendance/report/page.tsx:10`
  4. `app/(dashboard)/shifts/manual-entry/ManualShiftEntry.tsx:29`
  5. `app/(dashboard)/settings/ClosureCalendar.tsx:12`
  6. `app/(dashboard)/booths/page.tsx:8`
  7. `components/schedule/WeeklyCalendar.tsx:49`
  8. `components/schedule/ScheduleFilter.tsx:38`
- **問題**: 正である `lib/utils/datetime.ts:30` の `toDateStr` と同一実装が8箇所にコピペされている。日付処理の修正が全箇所へ波及しない
- **変更**: 各ファイルで、ローカルの `function toDateStr(...) {...}` 定義を削除し、ファイル冒頭の import 群に `import { toDateStr } from '@/lib/utils/datetime'` を追加する。実装本体は一切変えない
  - 注意1: 変更前に各ローカル実装が datetime.ts:30-36 と**意味的に同一**（getFullYear/getMonth+1/getDate をゼロ埋めして `YYYY-MM-DD`）であることを目視確認する。異なる実装だった場合はそのファイルをスキップし、報告に含める
  - 注意2: クライアントコンポーネント（'use client'）からの import も問題ない（datetime.tsは純粋関数のみ）
- **別処理**: `app/(dashboard)/print/monthly/preview/page.tsx:173` の `const toDateStr = (day: number) => ...` は**シグネチャが異なる別関数**。集約対象外だが名前衝突・混同のもとなので、同ファイル内でこの変数名を `dayNumToDateStr` にリネームする（定義1箇所＋同ファイル内の使用箇所のみ。他ファイルに影響なし）
- **完了条件**: 【共通確認】＋ `grep -rn "function toDateStr\|const toDateStr" app components --include="*.tsx" --include="*.ts"` の出力が0行
- **リスク/戻し方**: 低。挙動同一の置換のみ。壊れたら該当コミットをrevert
- **依存**: 項目0

## R3: `WeeklyShiftTable.tsx` のローカル定数・関数を共有実装へ集約
- **対象**: `components/shifts/WeeklyShiftTable.tsx:34-47`（REGULAR_SLOT_TIMES / INTENSIVE_SLOT_TIMES）、同 `:56-59`（ローカル getTermTypeForDate）
- **問題**: 時間帯の正は `lib/constants/timeSlots.ts`、term判定の正は `lib/utils/schedule.ts` にあるのに、両方をローカル再実装している。時間割変更時に片方だけ直る事故の温床
- **変更**:
  1. `lib/utils/schedule.ts` の `getTermTypeForDate` のパラメータ型を構造的最小型に広げる（呼び出し側は変更不要の後方互換な広げ方）:
     ```ts
     // 変更前
     export function getTermTypeForDate(dateStr: string, termPeriods: TermPeriod[]): 'regular' | 'intensive' {
     // 変更後
     export function getTermTypeForDate(
       dateStr: string,
       termPeriods: Pick<TermPeriod, 'start_date' | 'end_date' | 'type'>[]
     ): 'regular' | 'intensive' {
     ```
  2. `WeeklyShiftTable.tsx` で:
     ```ts
     import { REGULAR_SLOTS, INTENSIVE_SLOTS } from '@/lib/constants/timeSlots'
     import { getTermTypeForDate } from '@/lib/utils/schedule'

     const REGULAR_SLOT_TIMES: Record<number, { start: string; end: string }> =
       Object.fromEntries(REGULAR_SLOTS.map((s) => [s.index, { start: s.start, end: s.end }]))
     const INTENSIVE_SLOT_TIMES: Record<number, { start: string; end: string }> =
       Object.fromEntries(INTENSIVE_SLOTS.map((s) => [s.index, { start: s.start, end: s.end }]))
     ```
     とし、手書きのオブジェクトリテラルとローカル `getTermTypeForDate` 関数を削除。ローカル型 `TermPeriodLite` が上記Pick型と互換であることを確認（非互換なら中断して報告）
- **完了条件**: 【共通確認】＋ シフト管理画面のスロット時刻表示ロジックがgrepでローカル時刻リテラル（'09:30' 等）を含まないこと: `grep -n "16:30" components/shifts/WeeklyShiftTable.tsx` が0行
- **リスク/戻し方**: 低。値は完全一致（0-3のテストで定数の中身は固定済み）。revertで戻す
- **依存**: 項目0

## R4: スロット解決の三項演算子チェーンを `getSlotsForLesson()` に置換
- **対象**: `lib/utils/schedule.ts:39-43` と `:55-59` の2箇所（完全に同一のコピペ）
- **問題**: 同一ファイル内に同じ4分岐が2回コピペされており、既存の共有関数 `getSlotsForLesson`（lib/constants/timeSlots.ts:60）と同じ意味
- **変更**: 2箇所とも次の形に置換:
  ```ts
  // 変更前（2箇所とも同型）
  const slots =
    termType === 'intensive' ? INTENSIVE_SLOTS
    : lesson.day_of_week === 6 && lesson.type === 'group' ? GROUP_SATURDAY_SLOTS
    : lesson.day_of_week === 6 ? SATURDAY_INDIVIDUAL_SLOTS
    : REGULAR_SLOTS

  // 変更後
  const slots = getSlotsForLesson(lesson.type, lesson.day_of_week, termType)
  ```
  - import文を `import { getSlotsForLesson } from '@/lib/constants/timeSlots'` に整理し、不要になった定数importは削除
  - **等価性の根拠**（実行者の確認用）: getSlotsForLesson は intensive→INTENSIVE_SLOTS（limits未指定時）、(6,group)→GROUP_SATURDAY、(6,individual)→SATURDAY_INDIVIDUAL、その他→REGULAR で、元の三項と完全一致。ただし `lesson.type` の型が `'group' | 'individual'` であることを `types/index.ts` で確認すること。string型だった場合はこの項目を中断して報告
  - **スコープ制限**: 同型のチェーンが `components/schedule/WeeklyCalendar.tsx` や `app/(dashboard)/schedule/print/{day,week}/page.tsx` にもある可能性があるが、これらはUI固有の変形（limits対応・表示分割）が入っている可能性があるため、**上記の4分岐と一字一句同型（変数名の違いのみ許容）である場合に限り**同じ置換をしてよい。少しでも構造が異なる場合は触らず、報告に「未置換箇所」として列挙する
- **完了条件**: 【共通確認】。特に `tests/schedule.test.ts` の expandLessonsForMonth テストがpassすること（このテストがこの置換の等価性を直接検証している）
- **リスク/戻し方**: 低〜中。テストが等価性を保証。失敗時はrevert
- **依存**: 項目0（テスト）、R2（WeeklyCalendarを触る場合は同ファイルの編集競合を避けるためR2完了後）

## R5: 結合済みレコードの共有型を `types/index.ts` に追加
- **対象**: `types/index.ts`（追加のみ、既存型の変更なし）
- **問題**: Supabaseのjoin結果（teacher・enrollments・attendancesを含むlesson）に対応する型がなく、各所で `as any` や コンポーネントローカルinterfaceの再定義で凌いでいる（例: `components/dashboard/TodayLessons.tsx:10-31` がローカルにStudent/Lessonを再定義）
- **変更**: 以下を `types/index.ts` 末尾に追加（**この項目では型を定義するだけ**。利用側の変更はR6/R7):
  ```ts
  // ---- Supabase join結果の共有型 ----
  export interface StudentRef {
    id: string
    name: string
    grade: string
  }

  export interface AttendanceRef {
    student_id: string
    status: 'present' | 'absent' | 'makeup_used'
  }

  export interface LessonWithRelations extends Lesson {
    teacher: { name: string } | null
    enrollments: { student: StudentRef | null; subject?: string | null }[]
    attendances?: AttendanceRef[]
  }
  ```
  注意: `Lesson` 既存フィールドと衝突するプロパティ（teacher_id等）はそのまま。`status` のリテラル型は TodayLessons.tsx:17 の既存定義に合わせてある。実際のDB値と食い違う場合（例: statusに別値がある）は、リテラルをやめ `string` にして報告
- **完了条件**: 【共通確認】（追加のみなので既存に影響しないはず）
- **リスク/戻し方**: 極小。revert
- **依存**: 項目0

## R6: `app/(dashboard)/schedule/intensive/actions.ts` の any 除去
- **対象**: `app/(dashboard)/schedule/intensive/actions.ts:215, 241, 246, 251, 265, 273, 280, 287, 292, 300`
- **問題**: 1ファイルに `as any[]` が10箇所集中。Supabaseクエリ結果を全部anyで受けており、カラム名のtypoが実行時まで発覚しない
- **変更**: ファイル冒頭にこのファイル専用のクエリ結果型を定義し、各 `as any[]` を置換する。方針:
  ```ts
  // ファイル上部に追加（selectしている実際のカラムに合わせて調整すること）
  type EnrollmentRow = { lesson_id: string; student_id: string; subject: string | null }
  type LessonRow = {
    id: string; day_of_week: number; slot_index: number
    type: 'individual' | 'group'; term_type: 'regular' | 'intensive'
    subject: string; teacher: { name: string } | null
    enrollments: { student_id: string }[]
  }
  type TeacherRow = { id: string; name: string; subjects: string[] | null }
  type ShiftRow = { teacher_id: string; date: string; slot_index: number }
  ```
  - 各行の `(xxx as any[])` を `((xxx ?? []) as LessonRow[])` 等の**具体型**に置換
  - **重要な制約**: 型は「そのselect文で実際に取得しているカラム」を写し取ること。selectを読んで型を作る、の一方向。**select文自体・ロジック・戻り値の構造は一切変更しない**
  - `(l.teacher as any)?.name`（246行目）のようなネストしたキャストは、行型に teacher を持たせることで自然に消える
- **完了条件**: 【共通確認】＋ `grep -n "any" app/\(dashboard\)/schedule/intensive/actions.ts` が0行（コメント内は許容）＋ 講習プランナー画面（/schedule/intensive）が開けて一覧が表示される（手動確認）
- **リスク/戻し方**: 中。型の写し取りを誤ると tsc が落ちるだけ（実行時挙動には影響しない安全な失敗）。tscが通らない場合はselect文と型を突き合わせて修正。解決不能ならrevertして報告
- **依存**: 項目0

## R7: コンポーネント境界の `as any` 除去（R5の型を利用）
- **対象と個別方針**（各箇所とも「呼び出し側のキャスト除去＋受け側の型をR5の共有型 or 具体型へ」）:
  1. `app/(dashboard)/page.tsx:203` の `lessons={todayLessons as any}` → `components/dashboard/TodayLessons.tsx:10-31` のローカルStudent/Attendance/Lesson定義を削除し、`import type { LessonWithRelations, StudentRef, AttendanceRef } from '@/types'` に置換。props型は `lessons: LessonWithRelations[]`。呼び出し側のキャストを外す。tscが指摘する不足フィールドがあれば、page.tsxのselect文は変えずに **LessonWithRelations 側をoptional化**して吸収し、その旨報告
  2. `app/(dashboard)/booths/BoothBoard.tsx:171, 209, 264` の `(lesson as any).teacher?.name` → このファイルのlesson props型に `teacher: { name: string } | null` を追加してキャスト除去
  3. `app/(dashboard)/students/new/page.tsx:20`、`app/(dashboard)/students/[id]/page.tsx:34` の `lessons={(lessons as any[]) ?? []}` → 受け側 `components/students/StudentForm.tsx` のlessons prop型を確認し、page側のselectが返す形に合わせた具体型（または LessonWithRelations）へ
  4. `app/(dashboard)/search/page.tsx:119` の `lessons!.map((l: any) =>` → select句（id, subject, type, day_of_week, slot_index, teacher(name)）を写した行型を定義して置換
  5. `app/api/export/lessons/route.ts:17, 27` の `(l: any)` / `(e: any)` → 同様にselect句を写した行型で置換
  6. `app/survey/respond/page.tsx:171` の `tokens={(tokens ?? []) as any}` → 受け側 SurveyRespond.tsx の props 型に合わせる（select句を写す）
  7. `app/(dashboard)/schedule/intensive/page.tsx:126-128` の3連キャスト → R6で定義した行型をexportして再利用、または同ファイルに同様の行型を定義
  8. `app/(dashboard)/schedule/print/week/page.tsx:364` の `(lesson as any).is_ps1` → このページのlesson型に `is_ps1?: boolean` を追加してキャスト除去
  9. `app/(dashboard)/schedule/intensive/IntensivePlanner.tsx:507` の `lesson.term_type as any, lesson.type as any` → lessonの型を具体化して除去。困難な場合は `as 'regular' | 'intensive'` のような**具体的リテラル型へのキャスト**までは許容（anyは不可）
- **問題**: データの実形状とコンポーネントローカル型のズレをanyで隠蔽している。スキーマ変更時に実行時エラーになる
- **変更方針の原則**: 「select文が正、型はそれを写す。ロジック・select・表示は不変」。1〜9をこの順で、**各番号ごとに tsc を回してから次へ**進む
- **完了条件**: 【共通確認】＋ `grep -rn "as any\|: any" app components lib --include="*.ts" --include="*.tsx"` の出力0行 ＋ 手動確認: ダッシュボード・ブース画面・生徒詳細・検索・週間印刷プレビューが表示できる
- **リスク/戻し方**: 中。件数が多いので**この項目のみ1〜9の番号単位でコミットを分けてよい**（コミットメッセージに番号を含める）。失敗した番号だけrevert可能にするため
- **依存**: R5、R6（7がR6の型を再利用するため）

## R8: 環境変数のフェイルファスト化
- **対象**: `lib/supabase/server.ts:8-9`、`lib/supabase/client.ts:5-6`、`lib/supabase/admin.ts:5-6`
- **問題**: `process.env.X!` の非null断言により、環境変数未設定でもビルドが通り、実行時に不明瞭なエラーで落ちる
- **変更**: `lib/env.ts` を新規作成:
  ```ts
  function required(name: string): string {
    const v = process.env[name]
    if (!v) throw new Error(`環境変数 ${name} が設定されていません`)
    return v
  }

  export const env = {
    supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  }
  ```
  各ファイルの `process.env.NEXT_PUBLIC_SUPABASE_URL!` を `env.supabaseUrl()` 等に置換。**遅延評価（関数呼び出し）にしている理由**: モジュールロード時に即throwするとビルド時（envが無い環境）に落ちるため。クライアントバンドルに含まれる `client.ts` では `NEXT_PUBLIC_` 変数のみ参照すること（service roleは絶対に参照しない）
- **完了条件**: 【共通確認】＋ ローカルで `npm run dev` してログイン→ダッシュボード表示ができる（手動確認）
- **リスク/戻し方**: 低〜中。Next.jsは `NEXT_PUBLIC_*` をビルド時にインライン展開するため、`process.env.NEXT_PUBLIC_X` の**プロパティアクセス形を保つ必要がある**（動的アクセス `process.env[name]` はクライアント側で undefined になる）。したがって client.ts で問題が出た場合、client.ts のみ次の形に変更する:
  ```ts
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL が設定されていません')
  ```
  （= client.ts は env.ts を使わず直書きチェック。server.ts / admin.ts はサーバー専用なので env.ts でよい）。それでも解決しなければ項目ごとrevertして報告
- **依存**: 項目0

---

# 4. やらないことリスト（実行者への禁止事項）

1. **機能追加・仕様変更・バグ修正をしない。** 途中でバグを発見した場合（例: `app/survey/respond/actions.ts` の delete→insert 非アトミック処理）は、コードに触れず最終報告に「発見事項」として記載する
2. **依存ライブラリの追加・更新・削除をしない。** 唯一の例外は項目0の `vitest`（devDependency）
3. **`select('*')` や select句の変更をしない。** カラムを絞る最適化は本計画のスコープ外（挙動変化リスクがあるため別計画で行う）
4. **巨大コンポーネントの分割をしない。** IntensivePlanner.tsx(571行)・LessonForm.tsx(533行)等の分割は効果があるが、本計画では行わない（差分が大きくレビュー不能になるため別計画で行う)
5. **ESLint / Prettier の導入・一括フォーマットをしない。** 差分にノイズが混ざり検証不能になる。既存ファイルのインデント・クォートスタイルは現状のまま踏襲する
6. **CSSやUIの見た目・文言を変更しない。** 印刷用CSS（@media print / @page）は特に触らない
7. **supabase/migrations 配下・DBスキーマに触れない**
8. **`.env.local`・環境変数の値・proxy.ts（認証ガード）に触れない**
9. **リネームの拡大をしない。** 本計画で明示したリネームは R2 の `dayNumToDateStr` のみ。他の「ついでに命名改善」は禁止
10. **計画外ファイルの「ついで修正」をしない。** tscエラー解消のためにやむを得ず計画外ファイルに触る場合は、その旨と理由をコミットメッセージと報告に必ず書く

---

# 5. 実行者への指示文（このままコピペして渡す）

```
あなたはリファクタリングの実行者です。同梱の「リファクタリング計画書」に従って juku-system リポジトリを改修してください。

ルール:
1. 計画書の項目0から順に、1項目ずつ実施する。項目を飛ばさない・並行しない・順序を変えない（R7のみ内部の番号単位でコミット分割可）。
2. 1項目完了するごとに、その項目の完了条件をすべて実行して確認し、git commit する。コミットメッセージは「refactor(R2): toDateStrをlib/utils/datetimeに集約」の形式。
3. 完了条件を満たせない場合は、その項目の変更を git で元に戻し、何をどこまで試して何が起きたかを報告して中断する。自己判断で回避策を実装しない。
4. 計画書の「やらないことリスト」を厳守する。よかれと思う逸脱をしない。
5. 各項目にある「〜の場合は中断して報告」の分岐条件に該当したら、必ず停止して報告する。
6. すべて完了したら、最終報告として (a)実施した項目と各コミットハッシュ、(b)スキップ・中断した項目と理由、(c)作業中に発見したがルール1・やらないことリストにより触れなかった問題点、を箇条書きで提出する。
```

---

# 6. 実行順トレース検証（計画の自己検証記録）

- 0→R1: Sidebar削除はテスト対象外のUIファイル。特性テストに影響なし ✓
- R1→R2: R2の対象8ファイルにSidebarは含まれない。競合なし ✓
- R2→R3: WeeklyShiftTableはR2の対象外（ローカルtoDateStrなし）。R3で広げる getTermTypeForDate のシグネチャは既存呼び出し（TermPeriod[]を渡す側）と後方互換（Pickは上位集合を受ける）✓
- R3→R4: R4はschedule.ts内の置換で、R3が同ファイルに加えた変更は関数シグネチャのみ。三項チェーン部分と交差しない。WeeklyCalendarを触る場合はR2で同ファイルのtoDateStrが先に処理済みのため、diff競合しない ✓
- R4→R5: R5は型追加のみで既存コードに影響しない ✓
- R5→R6: R6はintensive/actions.ts内で完結。R5の型は使わない（ファイル固有の行型）が、順序上の問題なし ✓
- R6→R7: R7-7がR6の行型exportを再利用するため、R6が先である必要がある（依存明記済み)✓
- R7→R8: R8はlib/supabase配下のみ。R7と交差しない ✓
- テストの安定性: 特性テストは lib/ の純粋関数のみを対象としており、R1/R7/R8のUI・インフラ変更で壊れない。R3/R4のロジック集約はテストが直接検証する ✓
```
