interface CardProps {
  title?: string
  action?: React.ReactNode
  padding?: 'default' | 'none'
  className?: string
  children: React.ReactNode
}

export function Card({ title, action, padding = 'default', className = '', children }: CardProps) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm dark:ring-1 dark:ring-gray-700 ${className}`}>
      {title && (
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          {action}
        </div>
      )}
      <div className={padding === 'default' ? 'p-6' : ''}>{children}</div>
    </div>
  )
}
