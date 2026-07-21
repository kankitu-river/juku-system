export const SURVEY_NG_REASONS = [
  { key: 'school',    label: '授業（大学・学校）' },
  { key: 'exam',      label: '試験期間' },
  { key: 'trip',      label: '帰省・旅行' },
  { key: 'other_job', label: '他のバイト' },
  { key: 'health',    label: '体調・通院' },
  { key: 'personal',  label: '私用' },
  { key: 'other',     label: 'その他' },
] as const

export type NgReasonKey = typeof SURVEY_NG_REASONS[number]['key']

export const SURVEY_MAYBE_REASONS = [
  { key: 'this_week_only', label: '今週のみ授業可能' },
  { key: 'late_arrival',   label: '遅れて到着するが授業可能' },
  { key: 'early_leave',    label: '早退が必要だが授業可能' },
  { key: 'other_job_adj',  label: '他バイトと調整次第' },
  { key: 'other',          label: 'その他' },
] as const

export type MaybeReasonKey = typeof SURVEY_MAYBE_REASONS[number]['key']
