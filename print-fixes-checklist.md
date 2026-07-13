# 印刷修正 変更ファイル一覧・動作確認手順

`print-fixes.md` の適用で変更されるのは以下の **2ファイルのみ**。

---

## 変更ファイル

### 1. `app/(dashboard)/schedule/print/day/page.tsx`
- 修正1（PS1バッジ）… `LessonPosterCard` 関数を全体差し替え
- 修正2-a（vh→mm）… `@media print` 内の `.dpp-page` の `height: 100vh` → `height: 285mm`
- 修正2-b（比例配分）… `slotGroups.map` 内の `style={{ minHeight: ... }}` → `style={{ flexGrow: ..., flexBasis: 0 }}`
- 修正2-c（改ページ許可、任意）… `.dpp-slot` に `break-inside: avoid` 追加

### 2. `app/(dashboard)/print/monthly/preview/page.tsx`
- 修正3-a（動的zoom計算）… `byDate` 集計直後に `maxEntriesPerDay` と `zoomLevel` の算出コードを追加
- 修正3-b（zoomの動的化）… `<style>` 内の `zoom: 0.58` → `zoom: ${zoomLevel}`
- 修正3-c（セル高さの二重防御）… 日付セルの `<div className="h-52 print:h-40 ...">` → 動的 `minHeight`

`app/(dashboard)/schedule/print/week/page.tsx`（週間印刷）は**変更なし**。すでに `min-height` + `overflow: visible` で可変対応済みだったため。

---

## 動作確認手順

### ① PS1バッジ（day/page.tsx）
1. `is_ps1 = true` の個別授業（PS1授業）を1件含む日を選ぶ
2. `/schedule/print/day?date=YYYY-MM-DD` を開く
3. そのコマのカードが **紫**（集団授業と同じ色）になっていて、「1対1」の小バッジが出ていればOK
4. 印刷プレビュー（Ctrl+P）でも同じ色で出るか確認

### ② 日次印刷のはみ出し（day/page.tsx）
1. 実データで**授業が多い日**（例：8件以上入っている平日）を選ぶ
2. 印刷プレビューが1ページに収まるか確認。収まらない場合は修正2-cの改ページ許可を有効にしているか確認（コマの途中で切れずに、コマの区切りで2ページ目に続くのが正しい状態）
3. 逆に**授業が少ない日**（1〜2件だけの日）も確認し、コマ間の余白が不自然に大きくないか見る

### ③ 月次カレンダーのはみ出し（monthly/preview/page.tsx）
1. その月で**1日の授業数が一番多い日**を含む講師 or 生徒を選んで `/print/monthly/preview?...` を開く
2. その日のマスから文字がはみ出していないか、隣のマスに侵食していないか確認
3. 逆に授業が少ない月（夏休み前の通常期間など）も確認し、文字が小さすぎて読めなくなっていないか見る（`zoomLevel` の閾値 `0.85/0.68/0.55/0.42` は目安なので、実際の見た目で微調整が必要になる可能性あり）

---

## 確認時によくあるつまずき

- **ブラウザの印刷プレビューと実際の印刷（PDF保存）でズレる**ことがある。Chromeなら「その他の設定」→「余白：なし」「拡大縮小：デフォルト」になっているか確認
- Next.jsの開発サーバーは変更後 `npm run dev` の自動リロードで反映されるはずだが、反映されない場合はブラウザの強制リロード（Ctrl+Shift+R）を試す
- `zoomLevel` の見た目調整が必要な場合、`monthly/preview/page.tsx` の該当行の数値だけ変えれば良いので、Claude Codeに「zoomLevelの閾値をもう少し緩めて」のように頼めば微調整できる
