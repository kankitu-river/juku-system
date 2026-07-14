function req(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`環境変数 ${name} が未設定です`)
  return v
}

export function getPublicEnv() {
  return {
    url: req('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: req('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }
}

export function getServiceRoleKey(): string {
  return req('SUPABASE_SERVICE_ROLE_KEY')
}
