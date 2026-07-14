import { createClient } from '@supabase/supabase-js'
import { getPublicEnv, getServiceRoleKey } from '@/lib/env'

export function createAdminClient() {
  const { url } = getPublicEnv()
  return createClient(
    url,
    getServiceRoleKey(),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
