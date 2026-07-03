interface BadgeProps {
  children: React.ReactNode
  variant?: 'group' | 'individual' | 'regular' | 'intensive' | 'default'
  className?: string
}

const variantClasses = {
  group: 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200',
  individual: 'bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200',
  regular: 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200',
  intensive: 'bg-orange-100 dark:bg-orange-900/60 text-orange-800 dark:text-orange-200',
  default: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        variantClasses[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
