// src/App.tsx
import React, { useEffect, useState } from 'react'
import PayslipHelper from './PayslipHelper'
import CashBreakdown from './CashBreakdown'
import ThemeToggle from './components/ThemeToggle'

type TabKey = 'payslip' | 'cash'

export default function App() {
  // 讓分頁在重新整理後記住上次選擇（localStorage）
  const [tab, setTab] = useState<TabKey>(() => {
    const saved = (localStorage.getItem('app.tab') || '') as TabKey
    return saved === 'cash' ? 'cash' : 'payslip'
  })
  useEffect(() => {
    localStorage.setItem('app.tab', tab)
  }, [tab])

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: 24 }}>
      {/* 頂部：標題 + 日夜切換 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>薪資領據製作小幫手</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            ．支援 Word 套版（單張/批次）｜．現金面額拆分與統整
          </p>
        </div>
        <ThemeToggle />
      </div>

      {/* Tabs */}
      <div className="tabs" role="tablist" aria-label="features tabs" style={{ marginBottom: 12 }}>
        <button
          role="tab"
          aria-selected={tab === 'payslip'}
          aria-controls="tab-panel-payslip"
          id="tab-payslip"
          className={`tab ${tab === 'payslip' ? 'active' : ''}`}
          onClick={() => setTab('payslip')}
        >
          薪資領據
        </button>
        <button
          role="tab"
          aria-selected={tab === 'cash'}
          aria-controls="tab-panel-cash"
          id="tab-cash"
          className={`tab ${tab === 'cash' ? 'active' : ''}`}
          onClick={() => setTab('cash')}
        >
          現金面額拆分
        </button>
      </div>

      {/* Panels */}
      <div
        id="tab-panel-payslip"
        role="tabpanel"
        aria-labelledby="tab-payslip"
        hidden={tab !== 'payslip'}
      >
        <PayslipHelper />
      </div>

      <div
        id="tab-panel-cash"
        role="tabpanel"
        aria-labelledby="tab-cash"
        hidden={tab !== 'cash'}
      >
        <CashBreakdown />
      </div>

      <div className="footer" style={{ marginTop: 24 }}>
        © 2025 Payslip Helper
      </div>
    </div>
  )
}
