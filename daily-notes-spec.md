# 日次メモ機能 実装仕様書（Claude Codeに渡してそのまま使えます）

対象リポジトリ: `kankitu-river/juku-system`
既存マイグレーションは `009` まで進んでいる想定（`supabase/migrations/008_booth_sort_order.sql` の次）

## 背景・要件

紙のシフト表にある以下2つが、Webアプリにまだ存在しない。

1. 自転車整理の当番（例：「A班」「B班」のような時間帯別グループ分け）
2. その日全体への連絡事項（自習の呼びかけ、持ち物案内など、コマに紐づかない日次のお知らせ）

どちらも「授業（コマ）単位」ではなく「日付単位」の情報なので、既存の `lessons.notes` では表現できない。**自由記述のテキストエリア1つ**で両方をカバーする（自転車整理も「A班：田中、鈴木」のように手打ちで書ける想定）。将来、当番を構造化したくなったら別テーブルに分離する。

---

## 1. マイグレーション

`supabase/migrations/009_daily_notes.sql`

```sql
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
```

既に `set_updated_at()` 関数が別マイグレーションで定義済みなら重複作成しないよう `create or replace` のままでOK（同一定義なら上書きされるだけで害はない）。

---

## 2. 型定義の追加

`types/index.ts` に追加:

```ts
export interface DailyNote {
  id: string
  date: string          // 'YYYY-MM-DD'
  content: string
  updated_by: string | null
  created_at: string
  updated_at: string
}
```

---

## 3. Server Actions

新規ファイル `app/(dashboard)/schedule/daily-notes/actions.ts`

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getDailyNote(date: string): Promise<{ content: string }> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('daily_notes')
    .select('content')
    .eq('date', date)
    .maybeSingle()
  return { content: data?.content ?? '' }
}

export async function saveDailyNote(
  date: string,
  content: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('daily_notes')
    .upsert({ date, content }, { onConflict: 'date' })
  if (error) return { error: error.message }
  revalidatePath('/schedule')
  revalidatePath('/schedule/print/day')
  return {}
}
```

---

## 4. UI: 通常のスケジュール画面に編集欄を追加

日次スケジュール画面（`app/(dashboard)/schedule/page.tsx` など、日付選択がある画面）に、折りたたみ式のメモ欄を追加する。

```tsx
'use client'

import { useState, useEffect, useTransition } from 'react'
import { getDailyNote, saveDailyNote } from './daily-notes/actions'

export function DailyNoteEditor({ date }: { date: string }) {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(true)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getDailyNote(date).then((r) => setContent(r.content))
  }, [date])

  function handleSave() {
    startTransition(async () => {
      await saveDailyNote(date, content)
      setSaved(true)
    })
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-amber-700">連絡事項・当番メモ</span>
        {!saved && <span className="text-[10px] text-amber-600">未保存</span>}
      </div>
      <textarea
        className="w-full text-sm border border-amber-200 rounded p-2 bg-white resize-y min-h-[60px]"
        placeholder="例）自転車整理 A班：田中・鈴木／自習は14時以降OK"
        value={content}
        onChange={(e) => { setContent(e.target.value); setSaved(false) }}
        onBlur={handleSave}
      />
      {isPending && <p className="text-[10px] text-gray-400 mt-1">保存中...</p>}
    </div>
  )
}
```

呼び出し側（日付が確定している画面）で `<DailyNoteEditor date={dateStr} />` を配置。

---

## 5. 日次印刷への反映

`app/(dashboard)/schedule/print/day/page.tsx` に取得処理を追加。

```ts
// 既存のPromise.allに追加
const [{ data: lessons }, { data: termPeriods }, { data: teachersData }, { data: shiftsData }, { data: dailyNote }] = await Promise.all([
  // ...既存のクエリ...
  supabase.from('daily_notes').select('content').eq('date', dateStr).maybeSingle(),
])
```

コマ一覧の下（`.dpp-slots` の後）に追加表示:

```tsx
{dailyNote?.content && (
  <div className="mt-2 pt-2 border-t border-dashed border-gray-300 print:mt-1 print:pt-1">
    <p className="text-[10px] font-bold text-amber-700 print:text-[8px]">【連絡事項】</p>
    <p className="text-xs text-gray-700 whitespace-pre-wrap print:text-[9px]">{dailyNote.content}</p>
  </div>
)}
```

---

## 実装後の確認ポイント

- [ ] 同じ日付で2回保存しても重複行ができない（`onConflict: 'date'` が効いているか）
- [ ] メモが空欄のときは印刷に何も出ない（余計な余白ができない）
- [ ] 印刷画面のページ高さ計算（修正2で直したmm基準の`285mm`）に、メモ欄の分の高さがちゃんと収まるか要確認。メモが長いと再びはみ出す可能性があるので、`.dpp-page`側の `flex` 配分にメモ欄も `flex-shrink: 0` で含めておくこと
