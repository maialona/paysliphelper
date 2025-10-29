// src/App.tsx
import React from 'react'
import PayslipHelper from './PayslipHelper'
import ThemeToggle from './components/ThemeToggle'

export default function App() {
  return (
    <div style={{maxWidth: 1120, margin: '0 auto', padding: 24}}>
      {/* 頂部：標題 + 日夜切換 */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 16}}>
        <div>
          <h1 style={{margin: 0}}>薪資領據製作小幫手</h1>
          <p className="muted" style={{marginTop: 6}}></p>
        </div>
        <ThemeToggle />
      </div>

      <PayslipHelper />

      <div className="footer" style={{marginTop: 24}}>© 2025 Payslip Helper • Vite + React</div>
    </div>
  )
}
