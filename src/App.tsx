import React, { useState } from 'react'
import PayslipHelper from './PayslipHelper'
import CashBreakdown from './CashBreakdown'
import OcrTest from './components/OcrTest'
import ThemeToggle from './components/ThemeToggle'

export default function App() {
  const [tab, setTab] = useState<'payslip'|'cash'|'ocr'>('payslip')

  return (
    <div style={{maxWidth: 1120, margin: '0 auto', padding: 24}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 16}}>
        <div>
          <h1 style={{margin: 0}}>薪資工具箱</h1>
          <p className="muted" style={{marginTop: 6}}></p>
        </div>
        <ThemeToggle />
      </div>

      <div className="tabs">
        <button className={`tab ${tab==='payslip'?'active':''}`} onClick={()=>setTab('payslip')}>薪資領據</button>
        <button className={`tab ${tab==='cash'?'active':''}`} onClick={()=>setTab('cash')}>現金面額拆分</button>
        <button className={`tab ${tab==='ocr'?'active':''}`} onClick={()=>setTab('ocr')}>OCR 測試</button>
      </div>

      {tab === 'payslip' && <PayslipHelper />}
      {tab === 'cash'    && <CashBreakdown />}
      {tab === 'ocr'     && <OcrTest />}

      <div className="footer" style={{marginTop: 24}}>© 2025 Payslip Helper</div>
    </div>
  )
}
