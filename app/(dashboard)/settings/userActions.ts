'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export interface AppUser {
  id: string
  email: string
  role: string
  created_at: string
  last_sign_in_at: string | null
}

export async function listUsers(): Promise<{ users?: AppUser[]; error?: string }> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 })
  if (error) return { error: error.message }

  const users: AppUser[] = data.users.map((u) => ({
    id: u.id,
    email: u.email ?? '',
    role: (u.user_metadata?.role as string) ?? 'staff',
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
  }))

  return { users }
}

export async function createUser(
  email: string,
  password: string,
  role: 'admin' | 'staff'
): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role },
  })
  if (error) return { error: error.message }
  return {}
}

export async function updateUserRole(
  userId: string,
  role: 'admin' | 'staff'
): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { role },
  })
  if (error) return { error: error.message }
  return {}
}

export async function deleteUser(userId: string): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }
  return {}
}
