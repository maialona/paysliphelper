// src/components/ThemeToggle.tsx
import React from 'react'
import { useTheme } from '../useTheme'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      aria-label="切換日／夜模式"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--btn-bg)',
        color: 'var(--btn-text)',
        cursor: 'pointer'
      }}
    >
      <span style={{fontSize: 16}}>{isDark ? '🌙' : '☀️'}</span>
      <span style={{fontSize: 14}}>{isDark ? '夜間' : '日間'}</span>
    </button>
  )
}
