export function getPublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) throw new Error('環境変数 NEXT_PUBLIC_SUPABASE_URL が未設定です')
  if (!anonKey) throw new Error('環境変数 NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です')
  return { url, anonKey }
}

export function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('環境変数 SUPABASE_SERVICE_ROLE_KEY が未設定です')
  return key
}
