'use client'

import { useState, useTransition } from 'react'
import { saveIntensiveSlotLimits } from './actions'
import type { IntensiveSlotLimits } from '@/lib/constants/timeSlots'

const DAYS = [
  { dow: 1, label: '月曜日' },
  { dow: 2, label: '火曜日' },
  { dow: 3, label: '水曜日' },
  { dow: 4, label: '木曜日' },
  { dow: 5, label: '金曜日' },
  { dow: 6, label: '土曜日' },
  { dow: 0, label: '日曜日' },
]

const MAX_SLOT = 7

interface Props {
  initialLimits: IntensiveSlotLimits
}

export function IntensiveSlotSettings({ initialLimits }: Props) {
  const [limits, setLimits] = useState<IntensiveSlotLimits>(initialLimits)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  function getMax(dow: number): number {
    return limits[String(dow)] ?? MAX_SLOT
  }

  function setMax(dow: number, value: number) {
    setSaved(false)
    setLimits((prev) => ({ ...prev, [String(dow)]: value }))
  }

  function handleSave() {
    startTransition(async () => {
      const cleaned: IntensiveSlotLimits = {}
      for (const { dow } of DAYS) {
        const v = limits[String(dow)] ?? MAX_SLOT
        if (v < MAX_SLOT) cleaned[String(dow)] = v  // デフォルト(7)は保存不要
      }
      await saveIntensiveSlotLimits(cleaned)
      setSaved(true)
    })
  }

  return (
    <div>
      <div className="space-y-2 mb-4">
        {DAYS.map(({ dow, label }) => {
          const max = getMax(dow)
          const restricted = max < MAX_SLOT
          return (
            <div key={dow} className="flex items-center gap-4">
              <span className={[
                'w-16 text-sm font-medium',
                restricted ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400',
              ].join(' ')}>
                {label}
              </span>
              <select
                value={max}
                onChange={(e) => setMax(dow, Number(e.target.value))}
                className={[
                  'border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy',
                  restricted ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-400',
                ].join(' ')}
              >
                {Array.from({ length: MAX_SLOT }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>第{n}コマまで</option>
                ))}
              </select>
              {restricted && (
                <span className="text-xs text-amber-600 dark:text-amber-300">
                  第{max + 1}〜{MAX_SLOT}コマは非表示
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-4 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy-dark disabled:opacity-50 transition-colors"
        >
          {isPending ? '保存中...' : '保存'}
        </button>
        {saved && <span className="text-sm text-green-600 dark:text-green-300">保存しました</span>}
      </div>
    </div>
  )
}
