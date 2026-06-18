-- 生徒ごとの受講科目を lesson_enrollments に追加
ALTER TABLE lesson_enrollments ADD COLUMN IF NOT EXISTS subject TEXT;
