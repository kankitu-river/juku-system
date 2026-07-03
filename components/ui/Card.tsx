interface CardProps {
  title?: string
  action?: React.ReactNode
  padding?: 'default' | 'none'
  className?: string
  children: React.ReactNode
}

export function Card({ title, action, padding = 'default', className = '', children }: CardProps) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 ${className}`}>
      {title && (
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          {action}
        </div>
      )}
      <div className={padding === 'default' ? 'p-5' : ''}>{children}</div>
    </div>
  )
}
