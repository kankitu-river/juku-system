# トップナビゲーション化 実装仕様書

サイドバー（`components/layout/Sidebar.tsx`）を廃止し、画面上部の固定ナビゲーションバーに置き換える。

対象プロジェクト: `C:\Users\kanki\juku-system\juku-system`（Next.js 14 App Router + Tailwind）

---

## 1. 新規コンポーネント `components/layout/TopNav.tsx`

`'use client'`。既存 `Sidebar.tsx` の `navItems`（アイコンSVG含む）を流用しつつ、以下の構造に再編する。

### ナビ構造（グループ化）

```typescript
// 直リンク or ドロップダウングループの混在
const navigation = [
  { label: 'ダッシュボード', href: '/' },
  {
    label: 'スケジュール',
    children: [
      { href: '/schedule', label: '週間スケジュール',
        activeMatch: (p) => p.startsWith('/schedule') && !p.startsWith('/schedule/intensive') },
      { href: '/schedule/intensive', label: '講習割り振り' },
      { href: '/print/monthly', label: 'PDF出力' },
    ],
  },
  {
    label: '出欠・振替',
    children: [
      { href: '/attendance', label: '出欠管理',
        activeMatch: (p) => p.startsWith('/attendance') && !p.startsWith('/attendance/makeup') },
      { href: '/attendance/makeup', label: '振替管理' },
    ],
  },
  { label: 'シフト管理', href: '/shifts' },
  {
    label: '名簿',
    children: [
      { href: '/teachers', label: '先生管理' },
      { href: '/students', label: '生徒管理' },
      { href: '/booths', label: 'ブース管理' },
    ],
  },
  { label: 'イベント', href: '/events' },
]
// 「設定」(/settings) はナビには入れず、右クラスタに歯車アイコンで配置
```

アクティブ判定は既存 Sidebar と同じロジック（`href === '/'` は完全一致、それ以外は `startsWith`、`activeMatch` があれば優先）。グループボタンは配下のいずれかがアクティブなら親もアクティブ表示。

### ヘッダーバー（デスクトップ lg 以上）

- `<header className="sticky top-0 z-40 bg-[#1E3A5F] text-white shadow-md print:hidden">`
- 内側: `<div className="flex items-center h-14 px-4 gap-2">`
- **左**: ブランド。`<Link href="/">` で1行表示
  `塾スケジュール管理システム`（`text-base font-bold whitespace-nowrap`、`xl`未満では `塾スケジュール` に短縮表示: `<span className="hidden xl:inline">管理システム</span>` 方式で可）
- **中央ナビ** (`hidden lg:flex items-center gap-1 flex-1 ml-6`):
  - 直リンク: `px-3 py-2 rounded-lg text-sm font-medium`、アクティブ `bg-white/20 text-white`、非アクティブ `text-white/70 hover:bg-white/10 hover:text-white`（Sidebar と同トーン）
  - グループ: 同スタイルのボタン + 右に小さな chevron-down SVG。クリックで直下にドロップダウンパネル
    `absolute top-full left-0 mt-1 min-w-[180px] bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50`
    パネル内リンク: `block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50`、アクティブは `text-[#1E3A5F] font-semibold bg-gray-50`
  - ドロップダウン開閉: `useState<string | null>(openMenu)`。開いている間は `fixed inset-0 z-40` の透明オーバーレイでクリック外閉じを実現（document リスナーより単純で確実）。リンククリック・Escape キーでも閉じる。`usePathname()` の変化で閉じる（`useEffect`）
- **右クラスタ** (`hidden lg:flex items-center gap-1`):
  1. 検索フォーム（既存と同じ `GET /search`、`name="q"`）: `w-36 focus:w-48 transition-all` のコンパクト入力。スタイルは既存の `bg-white/10 placeholder-white/40 rounded-lg` を踏襲
  2. `<DarkModeToggle compact />`（下記 §3）
  3. 設定リンク `/settings`: 歯車アイコンのみ、`title="設定"`、`p-2 rounded-lg`、アクティブ時 `bg-white/20`
  4. ログアウト: 既存の `<form action="/api/auth/signout" method="POST">` を維持し、ボタンはアイコンのみ + `title="ログアウト"` + `aria-label="ログアウト"`

### モバイル（lg 未満）

- バー右端にハンバーガーボタン（`lg:hidden`）。従来の「画面左上に浮くfixedボタン」は廃止
- タップでヘッダー直下に全幅パネルを展開:
  `lg:hidden absolute top-full left-0 right-0 bg-[#1E3A5F] border-t border-white/10 shadow-lg max-h-[calc(100vh-3.5rem)] overflow-y-auto`
  （header に `relative` を付与）
- パネル内容（上から順）:
  1. 検索フォーム（フル幅）
  2. 全ナビ項目のフラットリスト。グループは `px-3 pt-3 pb-1 text-[11px] uppercase tracking-wide text-white/40` のセクション見出し + 配下リンク。各リンクは既存 Sidebar と同じ `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm`（タップターゲット44px相当を維持）
  3. 設定リンク（通常項目として）
  4. 区切り線の下に DarkModeToggle（フル幅版）とログアウト（フル幅版・ラベルあり）
- リンクタップで閉じる。背景オーバーレイは不要（パネル自体が全幅なので）
- アイコン: 既存 `navItems` の SVG をモバイルパネルの各リンクで再利用。デスクトップの横並びナビではアイコン省略（ラベルのみ）で幅を節約

## 2. `app/(dashboard)/layout.tsx` の変更

```tsx
import { TopNav } from '@/components/layout/TopNav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  )
}
```

- 旧ハンバーガー用の `pt-16 lg:pt-6` ハックは削除（sticky ヘッダーは通常フローに残るため不要）
- `max-w-7xl` は当面維持（サイドバー分の幅が空くので実質的に広がる）

## 3. `components/layout/DarkModeToggle.tsx` の変更

`compact?: boolean` prop を追加。`compact` 時はアイコンのみ（`p-2 rounded-lg`、`title` 属性は既存のまま、`aria-label` 追加）。デフォルト（ラベル付きフル幅）は現状維持しモバイルパネルで使用。ロジック（localStorage / `document.documentElement.classList`）は変更しない。

## 4. `Sidebar.tsx` の削除

置き換え完了後、プロジェクト全体で `Sidebar` の import が残っていないことを grep で確認してから `components/layout/Sidebar.tsx` を削除する。

## 5. 守ること・注意

- 配色ルールは既存踏襲: ネイビー `#1E3A5F` がナビ地色、アクティブは `bg-white/20`。アンバーはナビでは使わない（期間バッジ用に予約）
- `components/layout/Header.tsx`（ページ内タイトル用）は別物。触らない
- 印刷ページ（`/schedule/print/*`）にナビが写り込まないよう `print:hidden` を header に必ず付ける
- ダークモード時もヘッダーは同じネイビーで問題ない（既存サイドバーと同挙動）
- 認証まわり（`/api/auth/signout` の form POST）は形を変えない

## 6. 動作確認チェックリスト

- [ ] `npx tsc --noEmit` がエラーなしで通る
- [ ] `npm run build` が成功する
- [ ] `Sidebar` への参照がゼロ（grep 確認）である
- [ ] デスクトップ幅: 全グループのドロップダウンが開閉し、外側クリック・ページ遷移で閉じる
- [ ] 各ページでアクティブ表示が正しい（特に /attendance と /attendance/makeup、/schedule と /schedule/intensive の排他）
- [ ] モバイル幅: ハンバーガーでパネルが開閉し、リンクタップで閉じる
- [ ] 検索・ダークモード・ログアウトがデスクトップ／モバイル両方で機能する
