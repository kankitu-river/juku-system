# 印刷まわり修正パッチ（Claude Codeに渡してそのまま使えます）

対象リポジトリ: `kankitu-river/juku-system`

---

## 修正1: 日次印刷でPS1の紫バッジが出ない

**ファイル**: `app/(dashboard)/schedule/print/day/page.tsx`

`LessonPosterCard` 関数を以下に置き換える。

```tsx
function LessonPosterCard({ lesson }: { lesson: Lesson }) {
  const isGroup = lesson.type === 'group'
  const isPS1 = Boolean((lesson as { is_ps1?: boolean }).is_ps1)
  const isPurple = isGroup || isPS1   // ← PS1も紫扱いにする
  const teacher = (lesson as { teacher?: { name: string } }).teacher
  const booth = (lesson as { booth?: { name: string } }).booth
  const students = (lesson.enrollments ?? [])
    .map((e) => e.student)
    .filter((s): s is NonNullable<typeof s> => s != null)

  return (
    <div className={[
      'dpp-card flex-1 flex flex-col rounded-lg border-2 print:rounded overflow-hidden',
      'min-w-[130px] print:min-w-[28mm]',
      isPurple
        ? 'border-purple-400 bg-purple-50'
        : 'border-teal-400 bg-teal-50',
    ].join(' ')}>
      {booth?.name && (
        <div className={[
          'dpp-card-booth text-xs font-bold px-3 py-1 print:px-2 print:py-0.5 border-b flex items-center gap-1',
          isPurple
            ? 'bg-purple-200 border-purple-300 text-purple-800'
            : 'bg-teal-200 border-teal-300 text-teal-800',
        ].join(' ')}>
          {isPS1 && !isGroup && (
            <span className="text-[8px] font-bold px-1 rounded bg-purple-500 text-white">1対1</span>
          )}
          {booth.name}
        </div>
      )}

      <div className="dpp-card-body flex flex-col gap-1 p-3 print:p-2">
        {teacher?.name ? (
          <p className={[
            'dpp-card-teacher font-bold text-lg print:text-sm leading-tight',
            isPurple ? 'text-purple-900' : 'text-teal-900',
          ].join(' ')}>
            {teacher.name}
          </p>
        ) : (
          <p className="text-sm text-gray-400 print:text-xs">担当未設定</p>
        )}

        <div className="space-y-0.5">
          {students.length > 0 ? (
            students.map((s, i) => (
              <p key={i} className="text-sm print:text-[10px] leading-snug text-gray-800">
                {s.name}
                <span className="text-gray-500 ml-1 text-xs print:text-[8px]">（{lesson.subject}）</span>
              </p>
            ))
          ) : (
            <p className="text-xs text-gray-400">生徒未登録</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

booth未設定でPS1のときにもバッジが見えるよう、bodyの先頭にも出したい場合は `dpp-card-body` の先頭に同じ `{isPS1 && !isGroup && (...)}` を足してください。

---

## 修正2: 日次印刷が2枚目にはみ出す／余白が目立つ

**ファイル**: `app/(dashboard)/schedule/print/day/page.tsx`

### (a) CSSを vh基準 → mm基準 に変更

`@media print` 内のスタイルで、以下を変更:

```css
/* 変更前 */
.dpp-page {
  height: 100vh;
  ...
}

/* 変更後：A4縦 297mm − 上下余白6mm×2 = 285mm を直接指定 */
.dpp-page {
  height: 285mm;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}
```

vh は印刷時のページサイズ計算がブラウザ・バージョンによってブレることがあるので、`@page`のサイズから逆算した mm 固定値のほうが確実です。

### (b) コマの高さを「均等割り」→「コマ内の授業数に比例」に変更

`slotGroups.map` の中で、`style={{ minHeight: ... }}` を使っている行を置き換え:

```tsx
{/* 変更前 */}
<div key={`${slot.start}-${slot.end}`}
  className="dpp-slot flex flex-col border border-gray-300 rounded-lg print:rounded-none overflow-hidden"
  style={{ minHeight: `${Math.floor(100 / slotCount)}%` }}>

{/* 変更後：授業件数に応じて配分（0件のコマも最低1枠分は確保） */}
<div key={`${slot.start}-${slot.end}`}
  className="dpp-slot flex flex-col border border-gray-300 rounded-lg print:rounded-none overflow-hidden"
  style={{ flexGrow: Math.max(slot.lessons.length, 1), flexBasis: 0 }}>
```

これで「授業0〜1件のコマ」は小さく、「授業8件のコマ」は大きく自動配分されるので、無駄な余白とはみ出しの両方が改善します。

### (c) それでも1日の総授業数が多すぎて1ページに収まらない日がある場合

無理に1ページに収めようとすると文字が読めないほど小さくなるので、**2ページ目への自然な改ページ**を許可したほうが実用的です。`.dpp-page` の `overflow: hidden` を外し、`.dpp-slot` に `break-inside: avoid` を追加すると、コマの途中では改ページされず、コマの区切りできれいに2ページ目に続きます。

```css
.dpp-slot {
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
```

---

## 修正3: 月次カレンダー（講師別・生徒別）がはみ出す

**ファイル**: `app/(dashboard)/print/monthly/preview/page.tsx`

固定 `zoom: 0.58` をやめて、**その月の1日あたり最大授業数**から動的に縮小率を計算する。

### (a) データ集計後（`byDate` を作った直後）に追加

```tsx
const maxEntriesPerDay = Math.max(
  1,
  ...Array.from(byDate.values()).map((v) => v.length)
)
// 件数が多いほど強く縮小。3件以下なら等倍に近く、8件以上ならかなり縮小
const zoomLevel =
  maxEntriesPerDay <= 3 ? 0.85 :
  maxEntriesPerDay <= 5 ? 0.68 :
  maxEntriesPerDay <= 7 ? 0.55 :
  0.42
```

### (b) styleタグを動的値に変更

```tsx
{/* 変更前 */}
<style>{`
  @media print {
    @page { size: A4 landscape; margin: 0; }
    .no-print { display: none !important; }
    #monthly-print-area { zoom: 0.58; padding: 5mm; }
  }
`}</style>

{/* 変更後 */}
<style>{`
  @media print {
    @page { size: A4 landscape; margin: 0; }
    .no-print { display: none !important; }
    #monthly-print-area { zoom: ${zoomLevel}; padding: 5mm; }
  }
`}</style>
```

### (c) 日付セルの高さも「実件数に応じた下限」に変更（念のための二重防御）

```tsx
{/* 変更前 */}
<div className="h-52 print:h-40 overflow-hidden p-1 flex flex-col">

{/* 変更後 */}
<div
  className="print:h-auto overflow-hidden p-1 flex flex-col"
  style={{ minHeight: dayEntries.length > 4 ? '15rem' : '13rem' }}
>
```

zoomで縮小したうえで、件数が多い日だけ最低高さを少し余分に確保することで、ギリギリの日でも文字が枠からはみ出さなくなります。

---

## 補足：紙の現行表との比較について

今使っている紙のシフト表（添付画像4・5）は情報密度がかなり高いので、そのままの密度をWebアプリで再現しようとすると上記のような「詰め込みすぎて溢れる」問題が起きやすいです。上記3つを直せば、紙と同等以上の情報量を破綻なく印刷できるはずです。紙にある「自転車整理」「連絡事項」欄のような自由記述メモ機能がアプリ側にまだ無ければ、それは印刷まわりとは別に機能追加の候補になります（必要であれば設計します）。
