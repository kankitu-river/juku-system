'use client'

import { useEffect } from 'react'

export function AutoPrint() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('autoprint') !== '1') return

    const paperSize = params.get('paperSize')
    if (paperSize) {
      const style = document.createElement('style')
      style.id = '__print_page_size'
      style.textContent = `@page { size: ${paperSize}; margin: 10mm; }`
      document.head.appendChild(style)
    }

    window.print()

    if (paperSize) {
      setTimeout(() => document.getElementById('__print_page_size')?.remove(), 500)
    }
  }, [])

  return null
}
