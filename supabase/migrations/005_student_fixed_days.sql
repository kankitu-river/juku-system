-- 生徒の固定スケジュール（何曜日の何コマ目か）
-- fixed_slots: [{day: 2, slot: 2}, ...] (day: 1=月..6=土, slot: 1-7)
ALTER TABLE students ADD COLUMN IF NOT EXISTS fixed_slots JSONB DEFAULT '[]';
