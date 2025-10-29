// src/useTheme.ts
import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  // 1) localStorage > 2) 系統偏好 > 3) 預設 dark
  const saved = (localStorage.getItem('theme') as Theme | null)
  if (saved === 'light' || saved === 'dark') return saved
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  // 若系統主題變更，且使用者沒有手動覆蓋（可選擇，這裡預設尊重使用者設定，不自動改）
  // 如需跟隨系統，取消註解以下區塊：
  // useEffect(() => {
  //   const mq = window.matchMedia('(prefers-color-scheme: dark)')
  //   const onChange = () => setTheme(mq.matches ? 'dark' : 'light')
  //   mq.addEventListener?.('change', onChange)
  //   return () => mq.removeEventListener?.('change', onChange)
  // }, [])

  return { theme, setTheme }
}
