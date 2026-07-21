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
