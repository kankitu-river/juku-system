'use client'

import { useEffect, useRef } from 'react'

interface Props {
  landscape?: boolean
  marginMm?: number
  children: React.ReactNode
}

// 中身を測って、A4 1枚に収まるよう自動で縮小する。
// 印刷レイアウト＝画面レイアウトである前提（print専用のフォント縮小に頼らず、ここで一括縮小）。
export function FitToPage({ landscape = false, marginMm = 6, children }: Props) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function fit() {
      const inner = innerRef.current
      const outer = outerRef.current
      if (!inner || !outer) return
      inner.style.transform = 'none'
      // A4 を 96dpi 換算
      const mm = 96 / 25.4
      const pageW = (landscape ? 297 : 210) * mm - marginMm * 2 * mm
      const pageH = (landscape ? 210 : 297) * mm - marginMm * 2 * mm
      const w = inner.scrollWidth
      const h = inner.scrollHeight
      if (w === 0 || h === 0) return
      const scale = Math.min(pageW / w, pageH / h, 1)
      inner.style.transformOrigin = 'top left'
      inner.style.transform = `scale(${scale})`
      // 縮小後の高さを外側に反映（印刷で余白ページが出ないように）
      outer.style.height = `${h * scale}px`
      outer.style.width = `${w * scale}px`
    }

    // レイアウト確定後に実行
    const t = setTimeout(fit, 50)
    fit()
    window.addEventListener('beforeprint', fit)
    window.addEventListener('resize', fit)
    return () => {
      clearTimeout(t)
      window.removeEventListener('beforeprint', fit)
      window.removeEventListener('resize', fit)
    }
  }, [landscape, marginMm, children])

  return (
    <div ref={outerRef} className="fit-outer" style={{ overflow: 'hidden', margin: '0 auto' }}>
      <div ref={innerRef} className="fit-inner">{children}</div>
    </div>
  )
}
