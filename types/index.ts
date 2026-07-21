export type UserRole = 'admin' | 'staff'
export type LessonType = 'group' | 'individual'
export type TermType = 'regular' | 'intensive'
export type AttendanceStatus = 'present' | 'absent' | 'makeup_used'

export interface SubjectGrade {
  subject: string
  grades: string[]
}

export interface Teacher {
  id: string
  name: string
  email: string | null
  role: UserRole
  subjects: string[]
  grade_levels: string[]
  subject_grades: SubjectGrade[]
  created_at: string
}

export interface TermPeriod {
  id: string
  name: string
  type: TermType
  start_date: string
  end_date: string
  created_at: string
}

export interface DailyNote {
  id: string
  date: string          // 'YYYY-MM-DD'
  content: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface Booth {
  id: string
  name: string
  is_active: boolean
  sort_order: number
}

export type LessonKind = 'regular' | 'temporary'

export interface Lesson {
  id: string
  title: string
  type: LessonType
  lesson_kind: LessonKind
  specific_date: string | null  // YYYY-MM-DD, only for temporary lessons
  teacher_id: string | null
  day_of_week: number // 1=Monday ... 6=Saturday (Sunday=0 not used)
  slot_index: number  // 1-7
  term_type: TermType
  booth_id: string | null
  subject: string
  capacity: number
  is_ps1: boolean
  notes: string | null
  created_at: string
  teacher?: Teacher
  booth?: Booth
  enrollments?: LessonEnrollment[]
}

export interface Student {
  id: string
  name: string
  surname?: string | null
  grade: string
  subjects: string[]
  preferred_teacher_ids: string[]
  ng_teacher_ids: string[]
  fixed_slots: Array<{ day: number; slot: number; subject?: string; teacher_id?: string }>
  created_at: string
}

export interface LessonEnrollment {
  id: string
  lesson_id: string
  student_id: string
  subject?: string | null
  student?: Student | null
  created_at: string
}

export interface TimeSlot {
  index: number
  start: string
  end: string
}

// ---- Supabase join結果の共有型 ----
export interface StudentRef {
  id: string
  name: string
  grade: string
}

export interface AttendanceRef {
  student_id: string
  status: AttendanceStatus
}

// teacher/enrollments は join結果の実形状に合わせて Omit で上書き
export interface LessonWithRelations extends Omit<Lesson, 'teacher' | 'enrollments'> {
  teacher: { name: string } | null
  enrollments: { student: StudentRef | null; subject?: string | null }[]
  attendances?: AttendanceRef[]
}
