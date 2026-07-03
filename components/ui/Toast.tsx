'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'

interface ToastItem {
  id: number
  type: 'success' | 'error'
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const push = useCallback((type: 'success' | 'error', message: string) => {
    const id = nextId.current++
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const api: ToastApi = {
    success: useCallback((m: string) => push('success', m), [push]),
    error: useCallback((m: string) => push('error', m), [push]),
  }

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2">
          {toasts.map((t) => (
            <button
              key={t.id}
              onClick={() => dismiss(t.id)}
              className="flex items-center gap-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-800 dark:text-gray-100 min-w-[220px] max-w-[360px] text-left"
            >
              {t.type === 'success' ? (
                <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {t.message}
            </button>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}
