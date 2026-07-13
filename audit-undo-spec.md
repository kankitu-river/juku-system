# 監査ログ + 操作の取り消し（Undo）機能 実装仕様書

対象リポジトリ: `kankitu-river/juku-system`
拡張要件定義書の **1-2（監査ログ）** を拡張し、間違えた操作を元に戻せるUndo機能を一体実装する。
※これを実装したら、拡張要件定義書の1-2は完了扱いとする。

---

## コンセプト

- コマ（lessons）への **作成・更新・削除** をすべて記録する
- 各記録には「操作前の完全なスナップショット」を保存する
- どの記録からも **1クリックで操作前の状態に復元** できる
- Undo自体も監査ログに記録される（Undoの取り消しも可能 = Redo相当）

対象はまず lessons（授業コマ）のみ。生徒・講師・シフトへの拡張は同じパターンで後日可能な設計にする。

---

## 1. マイグレーション

`supabase/migrations/0XX_audit_logs.sql`（連番は現状に合わせる）

```sql
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,                 -- 'lessons'（将来拡張用）
  record_id uuid not null,                  -- 対象レコードのid
  action text not null check (action in ('create', 'update', 'delete', 'undo')),
  before_snapshot jsonb,                    -- 操作前の全カラム（createならnull）
  after_snapshot jsonb,                     -- 操作後の全カラム（deleteならnull）
  undone_log_id uuid references audit_logs(id),  -- undoの場合、取り消し対象のログid
  summary text,                             -- 人間可読な要約（「火曜第2コマ 担当:鶴丸→上島」）
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_record on audit_logs(table_name, record_id);
create index if not exists idx_audit_logs_created on audit_logs(created_at desc);

-- RLS（既存の010_intensive_plans_rls.sqlのパターンに倣う）
alter table audit_logs enable row level security;
```

注意: lesson_enrollments（受講生徒の紐付け）もコマとセットで復元する必要があるため、
before_snapshot / after_snapshot には **lessons本体 + enrollments配列** を格納する:

```json
{
  "lesson": { "id": "...", "day_of_week": 2, "slot_index": 2, "teacher_id": "...", ... },
  "enrollments": [ { "student_id": "...", "subject": "数学" }, ... ]
}
```

---

## 2. 記録レイヤー

新規ファイル `lib/audit/recorder.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

interface LessonSnapshot {
  lesson: Record<string, unknown>
  enrollments: { student_id: string; subject: string | null }[]
}

/** 現在のlesson+enrollmentsをスナップショット化 */
export async function snapshotLesson(
  supabase: SupabaseClient,
  lessonId: string
): Promise<LessonSnapshot | null> {
  const { data: lesson } = await supabase
    .from('lessons').select('*').eq('id', lessonId).maybeSingle()
  if (!lesson) return null
  const { data: enrollments } = await supabase
    .from('lesson_enrollments').select('student_id, subject').eq('lesson_id', lessonId)
  return { lesson, enrollments: enrollments ?? [] }
}

export async function recordAudit(
  supabase: SupabaseClient,
  params: {
    recordId: string
    action: 'create' | 'update' | 'delete' | 'undo'
    before: LessonSnapshot | null
    after: LessonSnapshot | null
    undoneLogId?: string
    summary: string
  }
) {
  await supabase.from('audit_logs').insert({
    table_name: 'lessons',
    record_id: params.recordId,
    action: params.action,
    before_snapshot: params.before,
    after_snapshot: params.after,
    undone_log_id: params.undoneLogId ?? null,
    summary: params.summary,
  })
}
```

### 既存Server Actionsへの組み込み

`app/(dashboard)/schedule/actions.ts` の各Action冒頭/末尾に追加:

- **createLesson**: insert成功後、`recordAudit({ action: 'create', before: null, after: <作成後snapshot>, summary: '◯曜 第◯コマ 作成' })`
- **updateLesson**: 更新前に `snapshotLesson` → 更新実行 → `recordAudit({ action: 'update', before, after })`
  - summaryには変わったフィールドだけを記す（差分検出は before/after のキー比較で単純に）
- **deleteLesson**: 削除前に `snapshotLesson` → 削除実行 → `recordAudit({ action: 'delete', before, after: null })`

監査記録のinsert失敗が本体操作を巻き込まないよう、recordAudit呼び出しはtry-catchで包み、失敗時はconsole.errorに留める。

---

## 3. 復元（Undo）レイヤー

新規ファイル `app/(dashboard)/history/actions.ts`

```ts
'use server'

// undoAudit(logId) の動作:
//   action='delete' のログ → before_snapshotからlessonをinsertし直し、enrollmentsも再作成
//   action='update' のログ → before_snapshotの内容でlessonをupdate、enrollmentsをdelete&insertで復元
//   action='create' のログ → 該当lessonをdelete（enrollmentsはcascade or 明示削除）
//   action='undo'   のログ → undone_log_id先のafter_snapshotを使って逆再生（Redo相当）
// 実行後、recordAudit({ action: 'undo', undoneLogId: logId, ... }) で記録
// revalidatePath('/schedule') と revalidatePath('/history') を呼ぶ
```

### 安全ガード
- 復元対象のレコードが**その後さらに変更されている場合**（対象record_idについて当該ログより新しいログが存在する場合）は、即時実行せず「このコマはこの操作の後にも変更されています。それでも戻しますか？」の確認ダイアログを挟む
- delete復元時、同一講師・同一スロットに別コマが既に入っていたら、1-1のダブルブッキング検証に引っかかるので、その場合はエラーメッセージで理由を表示（強行はさせない）

---

## 4. UI

### 4-1. 操作履歴ページ `/history`
- サイドバーに「操作履歴」を追加（アイコン: 時計の巻き戻し系）
- 直近100件を新しい順に一覧表示。各行:
  - 日時 / 操作種別バッジ（作成=緑、変更=アンバー、削除=赤、取り消し=グレー）
  - summary（「火曜第2コマ 担当: 鶴丸→上島」）
  - 「元に戻す」ボタン（action='undo'の行には「やり直す」と表示）
- フィルタ: 操作種別、期間（当日/7日/30日）

### 4-2. 操作直後のトースト
- コマの作成・更新・削除の成功時、画面下部に5秒間トースト表示:
  「コマを削除しました [元に戻す]」
- 実装: 共通コンポーネント `components/ui/UndoToast.tsx` を新設。Server Actionの戻り値に `auditLogId` を含め、トーストの「元に戻す」から undoAudit を呼ぶ

### 4-3. コマ詳細画面の履歴タブ
- `schedule/[id]` に「変更履歴」セクションを追加し、そのコマのログのみ表示（各行から復元可能）

---

## 5. 動作確認チェックリスト

- [ ] コマを削除 → トーストの「元に戻す」→ コマと受講生徒が完全に復元される
- [ ] コマの担当講師を変更 → /history から「元に戻す」→ 元の講師に戻る
- [ ] コマ作成を取り消す → コマが消える
- [ ] Undoした操作を「やり直す」→ Undo前の状態に戻る
- [ ] 復元先にダブルブッキングが発生する場合、エラーで止まり理由が表示される
- [ ] 対象がその後変更されている場合、警告ダイアログが出る
- [ ] 監査ログのinsertが失敗しても、コマ操作自体は成功する
- [ ] `npm run build` が通る
