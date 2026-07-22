-- 生徒のふりがな列を追加（名簿取り込み用）
alter table students add column if not exists furigana text not null default '';

-- 講師のふりがな列も追加（将来の名簿取り込み用）
alter table teachers add column if not exists furigana text not null default '';
