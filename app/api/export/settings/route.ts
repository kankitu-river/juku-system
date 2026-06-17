import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const [{ data: booths }, { data: termPeriods }, { data: appSettings }, { data: closures }] = await Promise.all([
    supabase.from('booths').select('*').order('name'),
    supabase.from('term_periods').select('*').order('start_date'),
    supabase.from('app_settings').select('*'),
    supabase.from('school_closures').select('*').order('date'),
  ])

  const backup = {
    exportedAt: new Date().toISOString(),
    version: 1,
    booths: booths ?? [],
    termPeriods: termPeriods ?? [],
    appSettings: appSettings ?? [],
    schoolClosures: closures ?? [],
  }

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="juku_settings_${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}
