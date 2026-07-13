# デザイン仕上げ 実装仕様書（design-polish）

対象リポジトリ: `kankitu-river/juku-system`
目的: 既存デザインの骨格（ネイビー×アンバー、テール=個別/パープル=集団、rounded-lg基調、Heroicons）は**維持**したまま、スケジュール管理UIの定石を適用して仕上げる。

**印刷ページ（`app/(dashboard)/schedule/print/`, `app/(dashboard)/print/`）と印刷用CSSには一切触れない。**

---

## D1. 時刻・数値の等幅数字化（tabular-nums）

**問題**: Noto Sans JPのプロポーショナル数字により、表内の時刻（16:30 / 18:10）や数値の桁幅が揃わない。

**変更**: `app/globals.css` に追加:

```css
/* 時刻・数値の桁幅を揃える（表・時刻表示全般） */
table {
  font-variant-numeric: tabular-nums;
}
.tabular-nums {
  font-variant-numeric: tabular-nums;
}
```

さらに、テーブル外で時刻や数値を表示している主要箇所に `tabular-nums` クラスを付与:
- ダッシュボードの統計数値（`app/(dashboard)/page.tsx` の text-3xl の数値）
- `components/dashboard/TodayLessons.tsx` のコマ時刻表示
- `components/schedule/WeeklyCalendar.tsx` のスロット時刻ラベル

**完了条件**: 週間カレンダーで「16:30〜18:00」と「18:10〜19:40」の桁が縦に揃って見える（目視）。`npm run build` 成功。

---

## D2. 「現在のコマ」インジケーター

**前提（実装確認済み）**: `components/dashboard/TodayLessons.tsx` には既に現在時刻の60秒間隔更新（`now` state, 69-73行目）と現在スロット判定（`currentIdx`, 142行目）が実装されている。**この検出ロジックは変更せず、視覚表現を強化する。**

**変更**: `TodayLessons.tsx` で `currentIdx` に一致するスロットブロックに:

```tsx
// 現在進行中スロットのコンテナに追加するクラス
'border-l-4 border-l-red-500 bg-red-50/30 dark:bg-red-900/10'
```

さらにスロット見出しの横に小さなライブインジケーター:

```tsx
{isCurrent && (
  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600">
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
    </span>
    進行中
  </span>
)}
```

既存の `currentIdx` 用の見た目（もし既に何らかの強調があれば）はこの表現に置き換えて統一する。

**完了条件**: 授業時間中にダッシュボードを開くと該当コマに赤い左バーと「進行中」が表示され、時間外は表示されない。

---

## D3. 週間カレンダーのヘッダー固定（sticky）

**対象**: `components/schedule/WeeklyCalendar.tsx` の平日テーブル（248行目付近のthead）と土曜テーブル。

**変更**:
1. テーブルの外側スクロールコンテナ（`overflow-x-auto` のdiv）に最大高さとY方向スクロールを追加:
   ```tsx
   className="overflow-auto max-h-[calc(100vh-220px)]"
   ```
   （220pxはTopNav＋ページ見出し＋フィルタ分の目安。実測して調整可）
2. thead に固定を追加:
   ```tsx
   <thead className="sticky top-0 z-20">
   ```
   ヘッダー行のth背景が透けないよう、各thに既にある `bg-gray-50` 等の背景色が付いていることを確認（付いていなければ `bg-white dark:bg-gray-800` を追加）
3. 左端の時間帯列を横スクロールで固定:
   ```tsx
   {/* 時間帯セル（各行の最初のth/td）に */}
   className="... sticky left-0 z-10 bg-white dark:bg-gray-800"
   ```
   ヘッダー左上の角セルは `z-30`（縦横両方の交点で最前面）

**注意**: `border-collapse` されたtableでstickyを使うとボーダーが消えることがある。その場合は `border-separate border-spacing-0` に切り替え、各セルのborderクラスを維持する。

**完了条件**: 週間カレンダーを縦スクロールしても曜日ヘッダーが、横スクロールしても時間帯列が画面に残る。ダークモードでも背景が透けない。印刷プレビュー（print/week）には影響がない。

---

## D4. アンバーのコントラスト是正

**問題**: `#F59E0B`（amber-500相当）を文字色に使うと白背景でコントラスト比 約2.2:1 となり、WCAG基準（4.5:1）を満たさない。

**変更**:
1. `grep -rn "text-amber-500\|text-amber-400\|text-\[#F59E0B\]" app components --include="*.tsx"` で洗い出す
2. **白背景上の文字**として使われている箇所のみ `text-amber-700`（dark: `dark:text-amber-400` は暗背景なのでそのまま可）に変更
3. 背景色・ボーダー・アイコン装飾としてのamberは変更しない

**完了条件**: 上記grepでヒットする「白背景×amber文字」が0件。見た目上、警告系テキストが読みやすくなっている。

---

## D5. 色の面積ルールの点検（カード背景の彩度）

**原則**: 面積が大きいほど彩度を下げる。カード背景=50番台 / ボーダー=200〜400 / 文字・バッジ=600〜800。

**変更**: 週間カレンダー・ブース画面・今日のコマのコマカードについて、背景に100番台以上（teal-100, purple-100等）を使っている箇所を50番台に落とす:

```
bg-teal-100 → bg-teal-50 （border-teal-300〜400 は維持）
bg-purple-100 → bg-purple-50
```

対象の探し方: `grep -rn "bg-teal-100\|bg-purple-100" components app --include="*.tsx"` 。ただし**Badgeコンポーネント（components/ui/Badge.tsx）は面積が小さいので100番台のまま変更しない**。ホバー状態（hover:bg-teal-100等）も変更しない。

**完了条件**: 週間カレンダーを開いたとき、カードの色面が薄くなり、講師名・生徒名の文字が主役に見える（目視）。Badgeの見た目は変化していない。

---

## D6. インタラクティブ要素のホバー統一

**変更**:
1. クリック可能なコマカード（週間カレンダー・今日のコマ・ブース画面でLinkやonClickを持つカード）に統一ホバーを付与:
   ```tsx
   'transition-all duration-150 ease-out hover:shadow-md hover:-translate-y-px'
   ```
2. クリックできない表示専用カードにはホバー効果を**付けない**（既に付いていたら外す）
3. 印刷ページのカードには絶対に付けない

**完了条件**: マウスを乗せると押せるカードだけがわずかに浮き、押せないカードは無反応。動きは150msで機敏。

---

## D7. 数値カードのタイポグラフィ階層

**対象**: `app/(dashboard)/page.tsx` の統計カード群。

**変更**: 数値と単位を分離した階層に統一:

```tsx
<p className="text-sm text-gray-500 dark:text-gray-400 mb-1">今日のコマ数</p>
<p className="text-3xl font-bold text-navy dark:text-blue-300 tabular-nums">
  24<span className="text-base font-normal text-gray-400 ml-0.5">コマ</span>
</p>
```

全統計カードで「ラベル(text-sm gray) → 数値(text-3xl bold navy tabular-nums) → 単位(text-base gray)」の3層構造に揃える。

**完了条件**: ダッシュボードの数値カードすべてが同じ階層構造で表示される。

---

## D8. 罫線ダイエット（「Excelっぽさ」の解消・最重要）

**問題**: 週間カレンダー・各種テーブル・カードのすべてにグレー罫線が引かれており、線の総量が多いことが安っぽい印象の最大要因。高品位なUIは線の代わりに余白と背景色差で領域を区切る。

**変更**:

1. **週間カレンダー（`components/schedule/WeeklyCalendar.tsx`）の縦罫線を撤去**:
   - 各td/thの `border` を `border-b`（横線のみ）に変更し、横線の色を一段薄く（`border-gray-200` → `border-gray-100 dark:border-gray-700/50`）
   - 列の区切りは罫線ではなく、列間の `px` を1段階増やすことで表現
   - 曜日ヘッダー行だけは下線をやや濃く残す（`border-b-2 border-gray-200`）：表の「天地」を作るため
   - 休校列の背景（bg-red-50/50）・今日ハイライトは現状のまま
2. **コマカードのborder薄化**: カードの `border-2 border-teal-400` 級の主張が強い枠を `border border-teal-200`（dark: `dark:border-teal-800`）に落とし、識別は背景色（D5の50番台）と左端のアクセント（必要なら `border-l-2 border-l-teal-400`）に寄せる
3. **`components/ui/Card.tsx` の二重区切り解消**: 現在 `shadow-sm + border` の二重表現になっている。borderを外し `shadow-sm` と背景差のみにする:
   ```tsx
   // 変更前
   <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 ${className}`}>
   // 変更後（ダークモードは影が見えないためringで輪郭を最小限残す）
   <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm dark:ring-1 dark:ring-gray-700 ${className}`}>
   ```
   タイトル下の `border-b` は残してよい（見出しと本文の区切りは機能的なため）

**対象外**: 印刷ページ（罫線は紙では必要な情報）。フォームの入力欄border（機能的に必須）。

**完了条件**: 週間カレンダーの画面から縦罫線が消え、行の横線のみがうっすら残る。Cardを使う全画面（ダッシュボード等)で輪郭線が消えても領域の区別がつく。ダークモードでカードの輪郭が識別できる。

---

## D9. 影の3階層システム

**問題**: `shadow-sm` が86箇所でほぼ全要素に均一に付いており、画面に奥行きの階層がない（現状: sm=86, md=2, lg=3, xl=3）。

**変更**: 影の意味を3層に固定し、CLAUDE.mdにルールとして追記する:

| 層 | 影 | 用途 |
|---|---|---|
| 0: 地面 | 影なし | ページ背景、表の行、インラインのバッジ・ピル |
| 1: 置かれている | `shadow-sm` | カード、パネル、統計カード |
| 2: 浮いている | `shadow-lg` | ドロップダウン、ポップオーバー、トースト、モーダル(`shadow-xl`可) |

具体的な作業:
1. `grep -rn "shadow-sm" app components --include="*.tsx"` で層0相当（テーブル行内の要素、小さなバッジ、ボタン）に付いている `shadow-sm` を削除する。**カード・パネル級の面に付いているものは残す**
2. `shadow-md`（2箇所）を確認し、層1なら `shadow-sm` に、層2なら `shadow-lg` に寄せる（mdという中間層を廃止）
3. ドロップダウンメニュー（TopNavのグループメニュー等）が `shadow-lg` 以上になっていることを確認

**完了条件**: `grep -rho "shadow-[a-z]*" app components --include="*.tsx" | sort | uniq -c` の結果に shadow-md が存在しない。画面上でカードとドロップダウンの浮き方に明確な差がある。

---

## D10. 余白の8pxリズム統一

**問題**: p-1 / p-1.5 / p-2 / p-3 / p-5 / p-6 が場当たり的に混在し、無意識の「詰まった感」を生んでいる。

**変更**: 余白を4段のスケールに固定し、以下のマッピングで統一する:

| 役割 | 値 | 適用先 |
|---|---|---|
| 密 | `p-2` (8px) | 表のセル内、コマカード内部 |
| 標準 | `p-4` (16px) | 小さめパネル、リスト項目 |
| ゆったり | `p-6` (24px) | カード内部（Card.tsxのp-5をp-6へ変更） |
| セクション | `gap-6` / `mb-8` | カード間、セクション間 |

具体的な作業:
1. `components/ui/Card.tsx` の `p-5` → `p-6`、ヘッダーの `px-5 py-4` → `px-6 py-4`
2. 週間カレンダーのセル: `p-1`/`p-0.5`級の極小paddingは `p-2` に引き上げ（※列幅が広がりすぎる場合はコマカード内部のみ p-2、セル自体は p-1.5 まで許容し、その旨コミットメッセージに記す）
3. ダッシュボードのカード間 gap を `gap-4` → `gap-6` に、セクション間を `mb-6` → `mb-8` に
4. **奇数値・中間値（p-1.5, p-3, p-5, py-2.5）を新規コードで使わないルール**をCLAUDE.mdに追記（既存の全置換はしない。触った画面から順次揃える方針）

**完了条件**: ダッシュボード・週間カレンダー・生徒一覧の3画面で、カード間とカード内の余白が視覚的に一定のリズムで刻まれている。表示崩れ（折り返し・はみ出し）がない。

---

## D11. 見出しのコントラスト強化

**問題**: ページタイトル（`components/layout/Header.tsx` の text-2xl）と本文の階層差が小さく、「デザインされている感」が弱い。

**変更**: `components/layout/Header.tsx`:

```tsx
// 変更前
<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
{subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}

// 変更後
<h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{title}</h1>
{subtitle && <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
```

Headerは全ページ共通コンポーネントのため、この1箇所の変更で全画面に効く。`tracking-tight`（字間をわずかに詰める）が日本語+英数字混在の大見出しを引き締める。ヘッダー下の余白が窮屈になる場合はHeader全体の `mb` を `mb-6` → `mb-8` に。

**完了条件**: 全ページでタイトルが一回り大きくなり、本文との階層差が明確になっている。長いタイトル（設定ページ等）が折り返しても崩れない。

---

## 実装順・コミット粒度

**D8 → D9 → D10 → D11 → D1 → D3 → D2 → D7 → D4 → D5 → D6** の順で、**1項目=1コミット**。

D8〜D10（罫線・影・余白）が「安っぽさ」の根本原因への対処なので先に実施する。D8とD5（彩度）は同じコマカードを触るため、D8の後にD5をやること（逆にしない）。

時間がなければ「D8＋D10」の2つだけでも印象は大きく変わる。

## 全項目共通の完了条件
- [ ] `npm run build` が通る
- [ ] 印刷プレビュー（print/day, print/week, print/monthly）の見た目が変更前と同一
- [ ] ダークモードで各変更箇所を一周確認（背景透け・コントラスト崩れがない・カード輪郭が識別できる)
- [ ] 週間カレンダー・ダッシュボード・生徒一覧・出欠画面をPC幅とスマホ幅の両方で目視確認（余白変更による折り返し崩れがない）

---

# 全体優先順位の中での位置づけ

この仕様書は、既存の実行順リストの **8番目（security-design-spec の P3 と同じ枠）** に入れる。合体後の全体順:

1. `security-design-spec.md` **P0-1**（daily_notes RLS）← 最優先・5分
2. 印刷の残件確認（日次印刷のはみ出しが直っているか。未反映なら `print-fixes.md` 修正2を再適用）
3. `refactoring-plan.md`（項目0〜R8。テスト基盤込み）
4. `security-design-spec.md` **P1**（アンケート保存の堅牢化）
5. `expansion-requirements.md` **Phase 1-1**（ダブルブッキング検証）
6. `audit-undo-spec.md`（監査ログ+Undo）
7. `expansion-requirements.md` Phase 1残り → Phase 2 → Phase 3（AI）
8. **本仕様書（design-polish）＋ security-design-spec P3** ← デザイン系はここでまとめて
9. security-design-spec P2（ロール分離）は講師ログイン決定後

**例外ルール**: D1（tabular-nums）とD3（sticky）は他のどの作業とも競合しにくく各30分以内で終わるため、疲れた日の「小さな一勝」として順番を無視して先にやってよい。ただしrefactoring-plan実行中（3の期間）だけは、同じファイル（WeeklyCalendar.tsx）を触るため割り込まないこと。
