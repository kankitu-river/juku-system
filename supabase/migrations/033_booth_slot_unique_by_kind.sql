-- ブース重複防止インデックスの是正
--
-- 旧 lessons_booth_slot_unique は (day_of_week, slot_index, term_type, booth_id) で一意にしていた。
-- これは臨時コマ(lesson_kind='temporary')の specific_date を区別しないため、
-- 「別々の日付の臨時コマ」でも同じ曜日・スロット・ブースだと衝突扱いになり、
-- 2件目の臨時コマ作成が not-null とは別のユニーク制約違反で失敗していた。
--
-- 種別ごとに分割する:
--   通常コマ … 曜日 × スロット × 期間 × ブース で一意（毎週固定のため）
--   臨時コマ … 開催日 × スロット × ブース で一意（特定日のみのため）
--
-- 通常⇔臨時をまたぐ同日同ブースの重なりは、アプリ側の validateLessonConflicts で
-- 警告として検出する（DBのハードエラーにはしない）。

drop index if exists lessons_booth_slot_unique;

create unique index if not exists lessons_booth_slot_regular_unique
  on lessons (day_of_week, slot_index, term_type, booth_id)
  where booth_id is not null and lesson_kind = 'regular';

create unique index if not exists lessons_booth_slot_temp_unique
  on lessons (specific_date, slot_index, booth_id)
  where booth_id is not null and lesson_kind = 'temporary';
