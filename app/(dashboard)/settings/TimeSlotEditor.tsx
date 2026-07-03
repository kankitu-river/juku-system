'use client'

import { useState, useTransition } from 'react'
import { saveTimeSlots } from './actions'
import type { TimeSlotConfig } from './actions'
import type { TimeSlot } from '@/types'
import {
  REGULAR_SLOTS,
  INTENSIVE_SLOTS,
  GROUP_SATURDAY_SLOTS,
  SATURDAY_INDIVIDUAL_SLOTS,
} from '@/lib/constants/timeSlots'

interface TimeSlotEditorProps {
  initialConfig: TimeSlotConfig | null
}

type SlotKey = keyof TimeSlotConfig

const SLOT_LABELS: Record<SlotKey, string> = {
  regular: '通常期間（月〜金 個別指導）',
  intensive: '講習期間（全曜日）',
  group_saturday: '土曜 集団授業',
  saturday_individual: '土曜 個別指導',
}

const DEFAULTS: TimeSlotConfig = {
  regular: REGULAR_SLOTS,
  intensive: INTENSIVE_SLOTS,
  group_saturday: GROUP_SATURDAY_SLOTS,
  saturday_individual: SATURDAY_INDIVIDUAL_SLOTS,
}

function initConfig(initial: TimeSlotConfig | null): TimeSlotConfig {
  if (!initial) return JSON.parse(JSON.stringify(DEFAULTS))
  return {
    regular: initial.regular ?? REGULAR_SLOTS,
    intensive: initial.intensive ?? INTENSIVE_SLOTS,
    group_saturday: initial.group_saturday ?? GROUP_SATURDAY_SLOTS,
    saturday_individual: initial.saturday_individual ?? SATURDAY_INDIVIDUAL_SLOTS,
  }
}

export function TimeSlotEditor({ initialConfig }: TimeSlotEditorProps) {
  const [config, setConfig] = useState<TimeSlotConfig>(() => initConfig(initialConfig))
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string>()

  function updateSlot(key: SlotKey, index: number, field: 'start' | 'end', value: string) {
    setConfig(prev => ({
      ...prev,
      [key]: prev[key].map((s: TimeSlot) => s.index === index ? { ...s, [field]: value } : s),
    }))
    setSaved(false)
  }

  function resetToDefault(key: SlotKey) {
    setConfig(prev => ({ ...prev, [key]: JSON.parse(JSON.stringify(DEFAULTS[key])) }))
    setSaved(false)
  }

  function handleSave() {
    setError(undefined)
    setSaved(false)
    startTransition(async () => {
      const result = await saveTimeSlots(config)
      if (result.error) { setError(result.error); return }
      setSaved(true)
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {(Object.keys(SLOT_LABELS) as SlotKey[]).map((key) => (
        <div key={key} className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{SLOT_LABELS[key]}</span>
            <button
              type="button"
              onClick={() => resetToDefault(key)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              デフォルトに戻す
            </button>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {config[key].map((slot: TimeSlot) => (
              <div key={slot.index} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-sm text-gray-500 dark:text-gray-400 w-14 flex-shrink-0">第{slot.index}コマ</span>
                <input
                  type="time"
                  value={slot.start}
                  onChange={e => updateSlot(key, slot.index, 'start', e.target.value)}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy w-28"
                />
                <span className="text-gray-400 text-sm">〜</span>
                <input
                  type="time"
                  value={slot.end}
                  onChange={e => updateSlot(key, slot.index, 'end', e.target.value)}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy w-28"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-5 py-2.5 bg-navy text-white rounded-lg text-sm font-semibold hover:bg-navy-light disabled:opacity-50 transition-colors"
        >
          {isPending ? '保存中...' : '時間を保存する'}
        </button>
        {saved && <span className="text-sm text-green-600 dark:text-green-300 font-medium">✓ 保存しました</span>}
      </div>
    </div>
  )
}
