# セキュリティ・デザイン改善 実装仕様書（優先順位順）

対象リポジトリ: `kankitu-river/juku-system`
**上から順に実装すること。P0は他のすべての作業より先に行う。**

---

# P0（即対応・セキュリティ）

## P0-1. daily_notes テーブルにRLSを設定

**現状の問題**: `009_daily_notes.sql` でRLSが有効化されておらず、テーブルが無防備。

新規マイグレーション `supabase/migrations/011_daily_notes_rls.sql`:

```sql
alter table daily_notes enable row level security;

drop policy if exists "authenticated_all_daily_notes" on daily_notes;
create policy "authenticated_all_daily_notes"
  on daily_notes
  for all
  to authenticated
  using (true)
  with check (true);
```

**併せて**: 今後のマイグレーションでは「新テーブル作成時は同一ファイル内でRLS有効化＋ポリシー設定までがセット」をルール化し、CLAUDE.mdにその旨を追記する。

**確認**: Supabaseダッシュボードの Table Editor で daily_notes に RLS enabled バッジが付くこと。anonキーのみのクライアントから select して拒否されること。

---

# P1（早期対応・セキュリティ）

## P1-1. アンケート回答保存のアトミック化

**現状の問題**: `app/survey/respond/actions.ts` が「既存回答をdelete → 新規insert」の2段階で、insert失敗時に回答が消失する。

**修正方針**: PostgreSQL関数（RPC）でトランザクション化する。

新規マイグレーション `supabase/migrations/012_submit_survey_response_fn.sql`:

```sql
create or replace function submit_survey_response(
  p_token_id uuid,
  p_responses jsonb   -- [{ "date": "...", "start_time": "...", "end_time": "..." }, ...] 実際の列構成に合わせること
)
returns void
language plpgsql
security definer
as $$
begin
  delete from shift_survey_responses where token_id = p_token_id;

  insert into shift_survey_responses (token_id, date, start_time, end_time)
  select
    p_token_id,
    (r->>'date')::date,
    (r->>'start_time')::time,
    (r->>'end_time')::time
  from jsonb_array_elements(p_responses) as r;

  update shift_survey_tokens set responded_at = now() where id = p_token_id;
end;
$$;
```

※ shift_survey_responses の実際の列名・型は `001_initial_schema.sql` を確認して合わせること。responded_at 相当の列名も実物に合わせる。

`app/survey/respond/actions.ts` 側は delete/insert/update の3呼び出しを
`await supabase.rpc('submit_survey_response', { p_token_id: token.id, p_responses: ... })`
の1呼び出しに置き換える。トークン検証・有効期限チェックの既存ロジックはそのまま残す。

## P1-2. 公開アンケートの防御強化

**現状**: トークンは randomUUID で十分な強度があり、有効期限チェックも実装済み（良い）。ただしレートリミットがない。

**対応（軽量版・外部サービス不要）**:

1. トークン照合失敗時に固定の待機を入れる（総当たり速度を落とす）:

```ts
// app/survey/respond/actions.ts のトークン不一致時
if (!token) {
  await new Promise((r) => setTimeout(r, 1000))
  return { error: '先生情報が見つかりません' }
}
```

2. `shift_survey_tokens` の "Anyone can read tokens by token value" ポリシー（001_initial_schema.sql 221行目）が select using (true) と全行公開になっている。トークン値を知らないと行を特定できないため実害は限定的だが、列挙可能性を残さないため、公開ページでのトークン照合をRPC（security definer）経由に変更し、anonからの直接selectポリシーを削除することを推奨:

```sql
-- 013_survey_token_hardening.sql
create or replace function verify_survey_token(p_survey_id uuid, p_teacher_id uuid)
returns table (id uuid, expires_at timestamptz)
language sql
security definer
as $$
  select id, expires_at from shift_survey_tokens
  where survey_id = p_survey_id and teacher_id = p_teacher_id
$$;

drop policy if exists "Anyone can read tokens by token value" on shift_survey_tokens;
```

※ 公開アンケートページがトークンをどうやって参照しているか（URL構造）を実装から確認し、既存フローを壊さないこと。壊れる場合はこの項をスキップして相談する。

3. 本格的なIPレートリミット（Upstash Redis等）は将来講師向け公開機能が増えたときに導入する。今回はスコープ外。

---

# P2（設計対応・セキュリティ）

## P2-1. admin / staff の2ロール導入

**前提**: 講師など塾長以外にログインアカウントを配る運用にする場合に必須。配らないなら実装を保留してよい（その判断もコミットメッセージに残す）。

**方針**:
- Supabase Authの `app_metadata.role` に 'admin' | 'staff' を設定（設定画面のユーザー管理＝userActions.ts を拡張し、service_role権限でメタデータを更新）
- RLSでの強制:
  - staff にも許可: lessons / attendances / daily_notes / shifts の読み書き
  - admin のみ: students・teachers の削除、settings系テーブル、export
- 具体的なポリシー例:

```sql
-- 例: studentsの削除をadminに限定
drop policy if exists "Authenticated users can write" on students;
create policy "staff_can_upsert_students" on students
  for insert to authenticated with check (true);
create policy "staff_can_update_students" on students
  for update to authenticated using (true) with check (true);
create policy "admin_can_delete_students" on students
  for delete to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'admin');
```

- UI側: role='staff' のとき、設定・PDF出力（export）・削除ボタンを非表示にする。`lib/auth/role.ts` にrole取得ヘルパーを新設
- **注意**: UIの出し分けだけでは防御にならない。必ずRLS側で強制する（UIは利便性のため）

---

# P3（デザイン改善）

## P3-1. 角丸の統一ルール

ルール: **カード・パネル=rounded-xl / ボタン・入力欄・小パネル=rounded-lg / バッジ・ピル=rounded-full**。`rounded-md`（5箇所）と用途外の混在を上記に寄せる。

- 対象: `grep -rn "rounded-md" app components` で出る箇所を確認し、ボタン/入力ならlg、カードならxlに変更
- 全ファイル一括置換はせず、明らかな混在のみ修正（印刷系の rounded-none は意図的なので触らない）
- CLAUDE.mdにこのルールを追記

## P3-2. 週間カレンダーに「表示密度」と「担当者フィルタ」

**ファイル**: `components/schedule/WeeklyCalendar.tsx`

1. ヘッダー部にトグル追加: [詳細 | コンパクト]
   - コンパクト時: LessonCardを1行表示（講師名＋人数のみ、生徒名非表示）、セルpaddingを縮小
   - 実装は `density: 'full' | 'compact'` のuseStateをカードコンポーネントにprops伝搬
2. 講師フィルタ: セレクトボックス「全員 / 講師名…」。選択時、その講師のコマだけ通常表示し、他は opacity-30 で薄く表示（非表示にはしない: 前後関係の把握のため）
3. どちらも画面表示のみの状態。印刷ページには影響させない

## P3-3. 空状態（empty state）の改善

データ0件の画面に、次アクションへの導線を追加する。対象と文言:

| 画面 | 現状 | 変更後 |
|---|---|---|
| 週間カレンダーの空セル | 「—」 | そのまま（セル単位は現状維持でよい） |
| 生徒一覧 0件 | 空メッセージ | 「生徒が登録されていません [+ 生徒を追加]」ボタン付き |
| 今日のコマ 0件 | 空 | 「今日のコマはありません [週次カレンダーを見る]」 |
| 振替管理 0件 | 空 | 「未消化の振替はありません 🎉」（ポジティブ表示） |

共通コンポーネント `components/ui/EmptyState.tsx`（icon, message, actionLabel?, actionHref?）を新設して各画面から使う。

## P3-4. 警告カードの視覚的階層

ダッシュボードの警告系カード（振替たまりすぎ・滞留アラート等）に左ボーダーを付けて、情報カードと区別する:

```tsx
// 警告系: border-l-4 border-l-orange-400 を追加
// 通常情報カード: 現状のまま（border border-gray-100）
```

`components/ui/Card.tsx` に variant prop（'default' | 'warning' | 'danger'）を追加して吸収するのが望ましい。

## P3-5. ダッシュボード数値カードに前週比較

「今日のコマ数」カードに、前週同曜日のコマ数を小さく添える:

```tsx
<p className="text-xs text-gray-400 mt-1">先週の同じ曜日: {lastWeekCount}コマ</p>
```

実装: page.tsx のPromise.allに前週同曜日のlessons count取得を1本追加（headオプション＋count='exact'で件数のみ取得）。

---

## 実装順序まとめ

| 優先度 | 項目 | 目安工数 |
|---|---|---|
| P0-1 | daily_notes RLS | 5分。**今すぐ** |
| P1-1 | アンケート保存のアトミック化 | 小 |
| P1-2 | アンケート防御強化 | 小 |
| P2-1 | ロール分離 | 中。講師にアカウント配る予定が決まってから |
| P3-1〜5 | デザイン改善 | 各小〜中。P0/P1完了後に順次 |

## Claude Codeへの指示例

```
security-design-spec.md の P0-1 を実装して
```

1項目ずつ実装 → 動作確認 → コミット → 次へ。

## 全項目共通の完了条件
- [ ] `npm run build` が通る
- [ ] 既存のスケジュール表示・印刷・出欠・アンケート回答が壊れていない
- [ ] マイグレーションはSupabaseに適用済み（ローカル確認だけで放置しない）
