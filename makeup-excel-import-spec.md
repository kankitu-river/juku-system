# 授業振替Excel取り込み 仕様書（振替.xlsx → 振替台帳）

塾で実運用中の `振替.xlsx`（スケ組みソフトの派生）にある **「授業振替」「授業振替終了済み」** シートを
Webアプリに取り込み、振替台帳として一覧・検索できるようにする。

## 元データ（振替.xlsx）

3シート: `日報　8行目　岩田さん`（空）/ `授業振替`（未消化）/ `授業振替終了済み`（消化済み）。

両シート共通の列（0始まり）:
| 列 | 内容 | 備考 |
|---|---|---|
| 0 | 受付日時 | Excelシリアル日付 |
| 1 | 授業日時 | シリアル日付 or 文字列（"夏期講習" 等） |
| 2 | 教科 | |
| 3 | 生徒氏名 | 全角空白あり |
| 4 | 振替希望日時 | 「テスト前」等の文字 or 実日付 |
| 5 | 次回定期テスト日 | |
| 6 | 備考 | |

**色による状態判定（実データで確認済み）**:
- `授業振替` シートで、生徒氏名セルの塗り色が **オレンジ(FFC000) → 振替日「未定」(pending)**、それ以外(白/無地) → **「決定」(scheduled)**。振替希望日時が実日付かどうかと100%一致。
- `授業振替終了済み` は全て **「消化済み」(completed)**。
- 読み取りには `XLSX.read(buffer, { cellStyles: true })` が必須（`xlsx@0.18.5` で fgColor.rgb が取れる）。

実測: 合計958件（未定66 / 決定18 / 済874）、生徒111名。

## 反映先

新テーブル `makeup_requests`（振替台帳）。既存の `makeup_credits`(残数) / `makeup_assignments`(実在コマ割当) では
元欠席授業・希望日テキスト・未定/決定・備考を保持できないため専用テーブルを新設。

- マイグレーション: `supabase/migrations/030_makeup_requests.sql`（RLS: authenticated 全許可）
- status: `pending`(未定) / `scheduled`(決定) / `completed`(済)
- `scheduled_date`: 振替希望日時テキストから best-effort でパース（年が無い場合は受付日の年で補完）。生テキストは `desired_raw` に必ず保持。
- 生徒は氏名（空白除去で正規化）で `students` にマッチ。未一致でも `student_name` は保持。

## 実装ファイル

- `lib/import/makeupParser.ts` — 両シートを解析（色→status、シリアル→日付、希望日パース）
- `app/(dashboard)/settings/import/actions.ts` — `previewMakeup` / `commitMakeup`（台帳は全件入れ替え、500件チャンクinsert）
- `app/(dashboard)/settings/import/ImportClient.tsx` — 「④ 授業振替」セクション（プレビュー→コミット）
- `app/(dashboard)/attendance/makeup/ledger/page.tsx` + `LedgerTable.tsx` — 台帳一覧（未定/決定/済 タブ・生徒名/教科 絞り込み）
- 導線: 振替管理ページ (`/attendance/makeup`) ヘッダーに「振替台帳を見る」ボタン

## 運用手順
1. Supabaseで `030_makeup_requests.sql` を実行
2. 「設定 > インポート」で `振替.xlsx` を選び、④ 授業振替 の「内容を確認する」→「入れ替え登録する」
3. 「振替管理 > 振替台帳を見る」で確認

## 基本方針：Excel非依存（重要）
このシステムは **Excelをやめて管理する** のが目的。したがって:
- **Excel取り込み(④)＝初回移行の1回だけ**。既存バックログを台帳(makeup_requests)へ移すためのもの。
  再実行はアプリ内で追加・編集した内容も含め **全件入れ替え** になるので、移行後は基本使わない。
- 以降は **台帳をアプリ内で管理**（Excel不要）。取り込み時に makeup_credits は触らない。

## アプリ内管理【実装済み】
振替台帳ページ (`/attendance/makeup/ledger`) で完結:
- **＋振替を追加**（生徒・教科・元授業・状態・希望メモ・備考）
- 状態遷移: **未定 →[日程を決める(日付入力)]→ 決定 →[済にする]→ 消化済み**（戻す操作もあり）
- **編集・削除**
- **生徒別の未消化（残数）** をページ上部に自動集計表示（makeup_credits に依存せず台帳から算出）
- サーバーアクション: `app/(dashboard)/attendance/makeup/ledger/actions.ts`
  （add/update/schedule/complete/setStatus/delete）

## コマ詳細ページとの連携【実装済み】
`/schedule/[id]` の「振替・欠席（特定日）」パネル(LessonMakeupPanel)を台帳直結に変更:
- **欠席にして振替へ回す**: 出欠を欠席で記録し、台帳に「未定」の振替を1件作成（`markAbsentToLedger`）。
- **振替で追加**: 台帳の未消化（未定/決定）から選び、このコマ・この日に割り当て → `makeup_assignments` 作成＋台帳を「済」に＋出欠を makeup_used に（`assignMakeupFromLedger`）。
- 旧クレジット方式(assignMakeup/markAbsentWithCredit)からは切り離した。

## 振替管理のおすすめコマを台帳に接続【実装済み】
振替管理ページ (`/attendance/makeup`) を台帳ベースに変更:
- 左：**台帳の未消化（未定/決定）** 一覧（名簿紐付け済みのみ）。生徒・教科・状態を表示。
- 右：選んだ項目の生徒に対し、既存のおすすめエンジン(makeupSuggestion)で
  **科目一致・シフト・任せたい先生・NG除外・分散・MLスコア** 込みの候補を提示。
- 割り当て → `assignMakeupFromLedger`（makeup_assignments 作成＋台帳を「済」＋出欠 makeup_used）。
- `AddCreditForm`（旧クレジット加算）はこのページから撤去（未使用）。

## 再振替（コマに置いたあとの置き直し）【実装済み】
マイグレーション `031_makeup_request_placement.sql` で makeup_requests に
`assigned_lesson_id` / `assigned_date`（配置先のコマ・日）を追加。

状態の意味を整理:
- **未定(pending)**: 予定なし
- **決定(scheduled)**: 決定日あり。コマ配置済み(assigned_lesson_id あり)なら「配置済」表示。まだ受講前 → **再振替できる**
- **済(completed)**: 受講し終わった

挙動:
- **コマに割り当て(`assignMakeupFromLedger`)**: status=決定 にして配置（makeup_assignments＋出欠 makeup_used 作成）。以前の配置があれば自動で消してから置き直す＝**再振替**。
- **配置を取消(`unassignMakeupRequest`)**: コマ割当・出欠を消し、決定のまま未配置に戻す。
- **未定へ / 削除 / 未定に編集**: いずれもコマ配置を連動して解除（`removePlacement`）。不整合を残さない。
- **済にする(`completeMakeupRequest`)**: 受講後に完了。配置は保持。
- 再振替は振替管理で同じ項目を選び直し、別コマに割り当てるだけ（前の配置は自動で置き換わる）。

## 未対応（今後の候補）
- 旧 makeup_credits を参照している箇所（生徒詳細の振替残数、欠席登録フロー等）の台帳ベースへの統一
- コマ詳細パネルの「振替で追加」にもおすすめ順の並びを反映（現状は台帳の未消化を素の順で表示）
