-- M2-4: 平文保存されている Anthropic API キーを削除
-- LLM機能を凍結し、DBに残っているAPIキーを安全のため削除する
delete from app_settings where key = 'anthropic_api_key';
