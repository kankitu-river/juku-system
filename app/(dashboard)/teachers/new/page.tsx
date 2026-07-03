import { Header } from '@/components/layout/Header'
import { TeacherForm } from '@/components/teachers/TeacherForm'
import { createTeacher } from '../actions'

export default function NewTeacherPage() {
  return (
    <div>
      <Header title="先生を登録" subtitle="新しい先生を追加します" />
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 max-w-2xl">
        <TeacherForm onSave={createTeacher} />
      </div>
    </div>
  )
}
