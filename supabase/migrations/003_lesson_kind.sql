-- 通常コマ（毎週固定）と臨時コマ（日付指定）の区別を追加

ALTER TABLE lessons
  ADD COLUMN lesson_kind TEXT NOT NULL DEFAULT 'regular'
  CHECK (lesson_kind IN ('regular', 'temporary'));

ALTER TABLE lessons
  ADD COLUMN specific_date DATE;

-- 臨時コマには specific_date が必須であることの制約
ALTER TABLE lessons
  ADD CONSTRAINT temporary_requires_date
  CHECK (lesson_kind = 'regular' OR specific_date IS NOT NULL);

COMMENT ON COLUMN lessons.lesson_kind IS 'regular=毎週固定, temporary=日付指定の臨時コマ';
COMMENT ON COLUMN lessons.specific_date IS '臨時コマの開催日（lesson_kind=temporaryの場合のみ）';
