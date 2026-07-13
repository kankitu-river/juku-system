# デザインシステム刷新仕様書 —「ネイビー&クリーン進化」

対象: `C:\Users\kanki\juku-system\juku-system`（Next.js 14 App Router + TypeScript + **Tailwind CSS v4**）

方針: 現行のネイビー基調を維持したまま品質を底上げする。色の意味は既存ルールを踏襲
（ネイビー=ブランド/見出し/アクティブ、アンバー=期間バッジ/注意、テール=個別、パープル=集団、赤=不可逆、緑=出席/完了、グレー=非優先）。

フェーズごとに独立して実装・検証できる構成。**各フェーズ完了時に `npx tsc --noEmit` と `npm run build` を通すこと。**

---

## Phase A: 基盤（デザイントークン + フォント + 共通コンポーネント）

### A-1. デザイントークン（Tailwind v4 `@theme`）

`app/globals.css` の `:root` 変数を `@theme` に昇格させ、ユーティリティクラスとして使えるようにする:

```css
@import "tailwindcss";

@variant dark (&:where(.dark, .dark *));

@theme {
  --color-navy: #1E3A5F;
  --color-navy-light: #2d5487;
  --color-navy-dark: #162c49;
  --color-amber-brand: #F59E0B;
  --font-sans: var(--font-noto), 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Meiryo', sans-serif;
}
```

これにより `bg-navy` `text-navy` `hover:bg-navy-light` 等が使える。
既存の `:root` の旧変数は削除してよい（参照箇所を grep で確認してから）。

### A-2. フォント: Noto Sans JP

`app/layout.tsx`（ルート）で `next/font/google` を使用:

```tsx
import { Noto_Sans_JP } from 'next/font/google'

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto',
  display: 'swap',
})
```

`<html>` に `notoSansJP.variable` を追加し、`globals.css` の `body { font-family: ... }` は削除
（`@theme` の `--font-sans` が body に効くよう `body { @apply font-sans; }` または明示指定）。

### A-3. 色トークンへの機械的置換

全 `.tsx` を対象に置換（grep で件数を before/after 確認）:
- `[#1E3A5F]` → `navy`（例: `bg-[#1E3A5F]` → `bg-navy`、`text-[#1E3A5F]` → `text-navy`）
- `[#2d5487]` → `navy-light`、`[#162c49]` → `navy-dark`
- `[#F59E0B]` → `amber-brand`

※ SVG の `fill`/`stroke` 属性や `.css` ファイル内、印刷用インラインstyleの16進値は対象外（classNameのみ）。

### A-4. 新規共通コンポーネント

**`components/ui/Card.tsx`**（サーバーコンポーネント可・'use client' 不要）:

```tsx
// 使い方: <Card> / <Card title="今日のコマ" action={<Link .../>}> / <Card padding="none">
interface CardProps {
  title?: string
  action?: React.ReactNode
  padding?: 'default' | 'none'   // none はテーブル等を直接入れる用
  className?: string
  children: React.ReactNode
}
```

- 外枠: `bg-white rounded-xl shadow-sm border border-gray-100`（ダッシュボードの既存カードと同一トーン）
- `title` 指定時: `px-5 py-4 border-b border-gray-100` のヘッダー行に `font-semibold text-gray-900` のタイトル + 右端に `action`
- 本文: `padding: 'default'` は `p-5`、`'none'` は無し

**`components/ui/Skeleton.tsx`**:

```tsx
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-gray-200 dark:bg-gray-700 ${className}`} />
}
```

補助として `SkeletonCard`（カード形の定型）と `SkeletonTable`（行数指定可）も同ファイルに export。

**`components/ui/Table.tsx`** は作らない。代わりにテーブル用の共通クラスセットを
`lib/constants/tableStyles.ts` に文字列定数で定義（`theadClass`, `thClass`, `tdClass`, `trHoverClass`）。
既存テーブルの書き方が画面ごとに違うため、コンポーネント化より定数共有の方が移行コストが低い。

### A-5. 既存カードマークアップの Card 化

`bg-white rounded-xl shadow-sm border` パターンを grep し、**素直に置き換えられる箇所のみ** `<Card>` に移行:
- `app/(dashboard)/page.tsx`（統計カード4枚 + 今日のコマ枠）
- 一覧系ページ（students / teachers / booths / events / shifts）の外枠
- 複雑な独自レイアウト（WeeklyCalendar 内部など）は無理に移行しない

### Phase A チェックリスト
- [ ] `bg-[#1E3A5F]` 等の16進 arbitrary class が className から消えている（grep で0件）
- [ ] 全画面で Noto Sans JP が適用されている（build 後の HTML に font 変数が出る）
- [ ] tsc / build 成功

---

## Phase B: ダッシュボード刷新

`app/(dashboard)/page.tsx` と `components/dashboard/` を対象。既存の統計カード・振替警告・TodayLessons は活かしつつ再構成する。

### B-1. 出欠未入力アラート（最重要）

終了時刻を過ぎたのに出欠が入っていない本日のコマを警告表示:

- 判定: 今日の各 lesson について、`lib/constants/timeSlots.ts` のスロット定義（`term_type` で REGULAR/INTENSIVE を切替）から終了時刻を取得し、現在時刻がそれを過ぎている ∧ `enrollments` に生徒がいる ∧ `attendances` に記録が無い生徒がいる
- 表示: 振替警告と同じトーンの警告カード（`bg-red-50 border-red-200`、見出し `🔔 出欠未入力のコマ`）。コマ名・時間・未入力人数を列挙し、各行から `/attendance/[lessonId]` へリンク
- 0件なら非表示

### B-2. 今日のタイムライン表示

`components/dashboard/TodayLessons.tsx` を読み、以下を追加:

- スロットごとのグループ表示に「現在進行中」ハイライト: 現在時刻がスロット時間内なら
  そのスロット見出しに `bg-amber-50 border-l-4 border-amber-brand` + 「進行中」バッジ
- 次のスロットには控えめに「次」表示
- 時刻はサーバー時刻ではなくクライアントで判定（'use client' のコンポーネント内で `new Date()`。
  すでに client ならそのまま。server なら進行中判定部分だけ小さな client コンポーネントに切り出す）

### B-3. レイアウト整理

- 統計カード: 既存4枚を維持（Card 化は Phase A 済み前提）
- 並び順: Header → 出欠未入力アラート（あれば）→ 振替警告2種 → 統計カード → 今日のコマ
  （アラート類を最上部に集める。朝イチで開いた時に「今日やること」が先に目に入る構成）

### Phase B チェックリスト
- [ ] 出欠未入力コマが正しく検出される（終了前のコマ・生徒0のコマは出ない）
- [ ] 進行中スロットのハイライトが時間帯で切り替わる
- [ ] tsc / build 成功

---

## Phase C: ダークモード完成

**現状: `dark:` クラスが .tsx に1つも存在しない**（トグルは `.dark` クラスを付けるだけで見た目が変わらない）。全画面に `dark:` バリアントを実装する。

### C-1. マッピング規則（機械的に適用）

| ライト | ダーク |
|---|---|
| `bg-white` | `dark:bg-gray-800` |
| body背景 `#f3f4f6` | `dark:` 時 `#0f172a`（globals.css で `.dark body`） |
| `bg-gray-50` | `dark:bg-gray-900/50` |
| `bg-gray-100` | `dark:bg-gray-700` |
| `text-gray-900` / `text-gray-800` | `dark:text-gray-100` |
| `text-gray-700` / `text-gray-600` | `dark:text-gray-300` |
| `text-gray-500` / `text-gray-400` | `dark:text-gray-400` |
| `border-gray-100` / `border-gray-200` | `dark:border-gray-700` |
| `text-navy`（見出し等） | `dark:text-blue-300` |
| 色付き警告カード `bg-orange-50` 等 | `dark:bg-orange-950/40 dark:border-orange-900 dark:text-orange-200` の要領で各色対応 |
| Badge の `bg-*-100 text-*-800` | `dark:bg-*-900/60 dark:text-*-200` |

### C-2. 適用順序と範囲

1. 共通コンポーネント: Card / Button / Badge / Modal / Skeleton / Header / TopNav（TopNav はネイビー地のままでよい＝変更不要）
2. ダッシュボード → schedule（WeeklyCalendar 含む）→ attendance 系 → 一覧系（students/teachers/booths/events/shifts）→ 設定・その他
3. **除外**: `app/(dashboard)/schedule/print/**` と `app/(dashboard)/print/**` と `components/print/**`（印刷は常にライト）。`survey/respond`（外部の先生が使うページ）は対応するが優先度最後

### C-3. 注意

- インライン `style={{...}}` の色は `dark:` が効かないため、見つけたら className に移してから対応
- コントラスト: 文字は最低でも gray-300、背景 gray-800 を基本に。授業種別色（テール/パープル）はダークでも識別できる濃度に
- 完了後、`dark:` の付いていない `bg-white` が残っていないか grep で監査（除外ディレクトリ以外で0件が目標）

### Phase C チェックリスト
- [ ] トグル切替で全主要画面が破綻なくダーク表示になる
- [ ] 印刷プレビュー/PDF はダークモード中でもライトのまま
- [ ] tsc / build 成功

---

## Phase D: ローディング & フィードバック

### D-1. ルートごとの `loading.tsx`

Phase A の Skeleton を使い、以下に `loading.tsx` を新設:

- `app/(dashboard)/loading.tsx` — 統計カード4枚 + リストのスケルトン
- `app/(dashboard)/schedule/loading.tsx` — カレンダー格子のスケルトン
- `app/(dashboard)/students/loading.tsx`、`teachers/`、`shifts/`、`attendance/` — テーブル型スケルトン

実ページのレイアウト（ヘッダー位置・カード配置）に形を合わせ、ガタつきを抑える。

### D-2. トースト通知

**`components/ui/Toast.tsx`**（'use client'）:

- `ToastProvider`（Context + 画面右下 `fixed bottom-4 right-4 z-50` のスタック表示）と `useToast()` フックを export
- `toast.success(msg)` / `toast.error(msg)` の2種。4秒で自動消滅、クリックで即消し
- success: 白地 + 緑アイコン、error: 白地 + 赤アイコン（ダーク対応も含める）
- `app/(dashboard)/layout.tsx` の `<main>` を `ToastProvider` でラップ

**接続**: 既存の操作フィードバックを調査して置き換える。
`alert(` と `confirm(` を grep し、**成功通知に使われている `alert` のみ** toast.success に置換
（confirm による確認ダイアログや、エラー時の alert は挙動変更になるので触らない。エラー alert は toast.error 化してよいが、フォームバリデーションの表示方式は変えない）。
主要対象: 出欠入力、コマ作成/編集/削除、シフト保存、生徒/先生の登録編集。

### Phase D チェックリスト
- [ ] 主要ページ遷移でスケルトンが表示される
- [ ] 保存成功時にトーストが出て自動で消える
- [ ] 成功系 alert が残っていない（grep 確認）
- [ ] tsc / build 成功

---

## 全フェーズ共通の守りごと

- 既存のコードスタイル（className 配列 `.join(' ')`、Server Component 優先）に合わせる
- Supabase クエリ・認証・データロジックは変更しない（Phase B の追加取得を除く）
- `components/layout/Header.tsx` の API（title/subtitle/actions）は変えない
- 印刷系（`@media print`、print ページ群）のレイアウトを壊さない
- 各フェーズは独立コミット相当のまとまりで完結させ、途中状態で終わらせない
