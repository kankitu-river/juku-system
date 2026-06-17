interface BadgeProps {
  children: React.ReactNode
  variant?: 'group' | 'individual' | 'regular' | 'intensive' | 'default'
  className?: string
}

const variantClasses = {
  group: 'bg-purple-100 text-purple-800',
  individual: 'bg-teal-100 text-teal-800',
  regular: 'bg-blue-100 text-blue-800',
  intensive: 'bg-orange-100 text-orange-800',
  default: 'bg-gray-100 text-gray-700',
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
