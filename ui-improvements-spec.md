# UI改善 実装仕様書（Claude Codeに渡してそのまま使えます）

対象リポジトリ: `kankitu-river/juku-system`

以下4点をまとめて実装する。

1. 色の意味の統一（授業種別以外の色ノイズを減らす）
2. ダッシュボードのサマリーカード追加（本日出勤講師数）
3. 週間ビューで「今日」の列をハイライト（**画面表示のみ・印刷には出さない**）
4. モバイル対応（サイドバー→ドロワー化）

---

## 1. 色の意味の統一

### 方針
今のブランドカラー（ネイビー `#1E3A5F` ／ アンバー `#F59E0B`）と、授業種別の色分け（テール＝個別、パープル＝集団）はこのまま維持する。崩さない。

変えるのは「それ以外の色」の**強さ**。特に週間カレンダーの「空き先生」バッジ（青い破線ピル）が、授業カードと同じ強さの色で表示されていて視線が分散するので、これを一段階弱める。

### 変更ファイル: `components/schedule/WeeklyCalendar.tsx`

該当箇所（空き先生バッジ、236行目付近）を以下に置き換え:

```tsx
{/* 変更前 */}
<a
  key={t.id}
  href={`/schedule/new?teacher_id=${t.id}&date=${dateStr}&slot_index=${slot.index}&term_type=${termType}`}
  title="クリックして臨時コマを追加"
  className="text-[10px] bg-blue-50 text-blue-600 border border-dashed border-blue-300 px-1.5 py-0.5 rounded-full whitespace-nowrap hover:bg-blue-100 hover:border-blue-400 transition-colors cursor-pointer"
>
  {t.name}
</a>

{/* 変更後：彩度を落として授業カードより目立たなくする */}
<a
  key={t.id}
  href={`/schedule/new?teacher_id=${t.id}&date=${dateStr}&slot_index=${slot.index}&term_type=${termType}`}
  title="クリックして臨時コマを追加"
  className="text-[10px] bg-gray-50 text-gray-400 border border-dashed border-gray-300 px-1.5 py-0.5 rounded-full whitespace-nowrap hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-colors cursor-pointer"
>
  {t.name}
</a>
```

普段はグレーで控えめ、ホバーしたときだけ青くなって「クリックできる」ことが分かる、という設計に変更。

### 今後の運用ルール（メモとして残す）

新しい画面を作るときの色の役割はこれで固定する。

| 色 | 用途 |
|---|---|
| ネイビー（`#1E3A5F`） | ブランド・見出し・アクティブナビ |
| アンバー（`#F59E0B`系） | 期間区分バッジ・注意喚起（強） |
| テール | 個別指導 |
| パープル | 集団授業・PS1 |
| 赤 | 休校・欠席・削除など不可逆operation |
| 緑 | 出席・完了 |
| グレー | 操作可能だが非優先の情報（空き先生など） |

この表は `CLAUDE.md` の末尾にでも追記しておくと、以後の画面追加でも色がブレなくなる。

※ 全ファイルの色を一括で洗い替える大規模リファクタリングは今回のスコープに含めない（影響範囲が大きすぎるため）。気になる画面が出てきたら都度直す方針でOK。

---

## 2. ダッシュボードに「本日出勤講師数」カードを追加

### 変更ファイル: `app/(dashboard)/page.tsx`

`Promise.all` に本日のシフトデータ取得を追加:

```tsx
const [
  { data: lessons },
  { data: termPeriods },
  { data: makeupCredits },
  { data: students },
  { data: todayShifts },        // ← 追加
] = await Promise.all([
  supabase
    .from('lessons')
    .select('*, teacher:teachers(name), enrollments:lesson_enrollments(student:students(id, name, grade)), attendances(student_id, status)')
    .eq('day_of_week', dayOfWeek)
    .order('slot_index'),
  supabase.from('term_periods').select('*')
    .lte('start_date', todayStr)
    .gte('end_date', todayStr),
  supabase.from('makeup_credits').select('student_id, total_credits, used_credits'),
  supabase.from('students').select('id, name, grade'),
  supabase.from('shifts').select('teacher_id').eq('date', todayStr),   // ← 追加
])

const workingTeacherCount = new Set((todayShifts ?? []).map(s => s.teacher_id)).size
```

統計カードのグリッドを3列→4列にして、カードを1つ追加:

```tsx
{/* 変更前 */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

{/* 変更後 */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
```

「クイックリンク」カードの前に新規カードを挿入:

```tsx
<div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
  <p className="text-sm text-gray-500 mb-1">本日出勤講師数</p>
  <p className="text-3xl font-bold text-[#1E3A5F]">
    {workingTeacherCount}
    <span className="text-base font-normal text-gray-500 ml-1">名</span>
  </p>
</div>
```

---

## 3. 週間ビューで「今日」の列をハイライト（画面のみ）

`components/schedule/WeeklyCalendar.tsx` は印刷用の `app/(dashboard)/schedule/print/week/page.tsx` とは**別コンポーネント**なので、ここを変更しても印刷には一切影響しない（確認済み）。

### 変更ファイル: `components/schedule/WeeklyCalendar.tsx`

コンポーネント内の適当な場所（`toDateStr` 関数の下あたり）に追加:

```tsx
const todayStr = toDateStr(new Date())
```

曜日ヘッダー部分（184行目付近）を変更:

```tsx
{/* 変更前 */}
{weekdays.map((day, i) => {
  const dateStr = weekDateStrings[i]
  const isClosed = closureDates.includes(dateStr)
  const dateObj = new Date(dateStr)
  const dateLabel = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`
  return (
    <th key={day.value}
      className={['border border-gray-200 px-3 py-3 text-center font-semibold',
        isClosed ? 'bg-red-50 text-red-400' : 'bg-gray-50 text-gray-700',
      ].join(' ')}>
      <div className="text-sm">{day.label}曜日</div>
      <div className="text-xs font-normal opacity-60">{dateLabel}</div>
      {isClosed && <div className="text-[10px] font-bold text-red-500 mt-0.5">休校</div>}
    </th>
  )
})}

{/* 変更後 */}
{weekdays.map((day, i) => {
  const dateStr = weekDateStrings[i]
  const isClosed = closureDates.includes(dateStr)
  const isToday = dateStr === todayStr
  const dateObj = new Date(dateStr)
  const dateLabel = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`
  return (
    <th key={day.value}
      className={['border px-3 py-3 text-center font-semibold relative',
        isClosed ? 'bg-red-50 text-red-400 border-gray-200' :
        isToday ? 'bg-amber-100 text-amber-900 border-amber-300 border-2' :
        'bg-gray-50 text-gray-700 border-gray-200',
      ].join(' ')}>
      {isToday && (
        <span className="absolute top-0.5 right-1 text-[9px] font-bold text-amber-600">TODAY</span>
      )}
      <div className="text-sm">{day.label}曜日</div>
      <div className="text-xs font-normal opacity-60">{dateLabel}</div>
      {isClosed && <div className="text-[10px] font-bold text-red-500 mt-0.5">休校</div>}
    </th>
  )
})}
```

各コマの列セル部分（214行目付近）も変更:

```tsx
{/* 変更前 */}
{weekdays.map((day, i) => {
  const dateStr = weekDateStrings[i]
  const isClosed = closureDates.includes(dateStr)
  // ...
  return (
    <td key={day.value}
      className={['border border-gray-200 px-2 py-2 align-top',
        isClosed ? 'bg-red-50/50' : '',
      ].join(' ')}
      style={{ minWidth: '190px' }}>

{/* 変更後 */}
{weekdays.map((day, i) => {
  const dateStr = weekDateStrings[i]
  const isClosed = closureDates.includes(dateStr)
  const isToday = dateStr === todayStr
  // ...
  return (
    <td key={day.value}
      className={['border px-2 py-2 align-top',
        isClosed ? 'bg-red-50/50 border-gray-200' :
        isToday ? 'bg-amber-50/60 border-amber-200' :
        'border-gray-200',
      ].join(' ')}
      style={{ minWidth: '190px' }}>
```

土曜表（`weekdays`とは別ロジックの土曜テーブル）は対象週の1日分固定なので、必要なら同様に `weekDates[5]` が今日かどうかで同じ処理を追加できるが、平日部分だけで十分実用的なので今回は対象外とする。

---

## 4. モバイル対応（サイドバー→ドロワー化）

### 方針
`lg`（1024px）以上ではこれまで通り固定サイドバー。それ未満では、画面上部に固定のハンバーガーボタンを出し、タップでサイドバーがオーバーレイ表示される形にする。

### 変更ファイル: `components/layout/Sidebar.tsx`

冒頭の `import` に `useState` を追加:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DarkModeToggle } from './DarkModeToggle'
```

`export function Sidebar()` の中身を以下のように変更:

```tsx
export function Sidebar() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* モバイル用ハンバーガーボタン（lg以上では非表示） */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-40 bg-[#1E3A5F] text-white p-2 rounded-lg shadow-md"
        aria-label="メニューを開く"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* モバイル用オーバーレイ背景 */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={[
        'w-64 bg-[#1E3A5F] text-white flex flex-col min-h-screen',
        'fixed lg:static top-0 left-0 z-50 transition-transform duration-200',
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ].join(' ')}>
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <h1 className="text-lg font-bold leading-tight">
            塾スケジュール
            <br />
            <span className="text-sm font-normal text-white/70">管理システム</span>
          </h1>
          {/* モバイル用 閉じるボタン */}
          <button
            onClick={() => setIsOpen(false)}
            className="lg:hidden text-white/60 hover:text-white"
            aria-label="メニューを閉じる"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 検索 */}
        <div className="px-3 py-3 border-b border-white/10">
          <form method="GET" action="/search">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                name="q"
                placeholder="検索..."
                className="w-full bg-white/10 text-white placeholder-white/40 text-sm rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:bg-white/20 transition-colors"
              />
            </div>
          </form>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = item.activeMatch
              ? item.activeMatch(pathname)
              : item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={[
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white',
                ].join(' ')}
              >
                {item.icon}
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 py-4 border-t border-white/10 space-y-1">
          <DarkModeToggle />
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              ログアウト
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
```

`navItems` 配列自体は変更不要（そのまま）。

### 変更ファイル: `app/(dashboard)/layout.tsx`

モバイルでハンバーガーボタンとコンテンツが重ならないよう、`main` に上部余白を追加:

```tsx
{/* 変更前 */}
<main className="flex-1 overflow-auto">
  <div className="p-6 max-w-7xl mx-auto">{children}</div>
</main>

{/* 変更後 */}
<main className="flex-1 overflow-auto">
  <div className="p-6 pt-16 lg:pt-6 max-w-7xl mx-auto">{children}</div>
</main>
```

---

## 動作確認チェックリスト

- [ ] 週間カレンダーの空き先生バッジが控えめなグレーになり、ホバーで青くなる
- [ ] ダッシュボードに「本日出勤講師数」カードが表示され、実際のシフト登録数と一致する
- [ ] 今日の日付の列だけアンバー色でハイライトされ、「TODAY」ラベルが出る
- [ ] `/schedule/print/week` の印刷プレビューには今日ハイライトが出ない（別コンポーネントなので影響しないはずだが念のため確認）
- [ ] スマホ幅（375px程度）でハンバーガーボタンが出て、タップでサイドバーが開閉する
- [ ] サイドバーのリンクをタップすると自動的に閉じる
- [ ] PC幅（1024px以上）ではハンバーガーボタンが消え、従来通り常時表示のサイドバーに戻る
