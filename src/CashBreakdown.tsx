// src/CashBreakdown.tsx
import React, { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

type DetailRow = {
  姓名: string
  總金額: number
  d1000: number
  d500: number
  d100: number
  d50: number
  d10: number
  d5: number
  d1: number
  // 狀態/件數相關已移除：總件數、錯誤欄位不顯示，但仍保留錯誤標記以利內部判斷
  錯誤?: string
}

const DENOMS = [1000, 500, 100, 50, 10, 5, 1] as const

function greedyBreakdown(amount: number) {
  const out = { d1000: 0, d500: 0, d100: 0, d50: 0, d10: 0, d5: 0, d1: 0 }
  let rest = amount

  for (const d of DENOMS) {
    const n = Math.floor(rest / d)
    rest -= n * d
    switch (d) {
      case 1000: out.d1000 = n; break
      case 500:  out.d500  = n; break
      case 100:  out.d100  = n; break
      case 50:   out.d50   = n; break
      case 10:   out.d10   = n; break
      case 5:    out.d5    = n; break
      case 1:    out.d1    = n; break
    }
  }
  return out
}

function normalizeInt(input: any): number | null {
  if (input === null || input === undefined) return null
  const s = String(input).replace(/[,\s]/g, '')
  if (!/^-?\d+$/.test(s)) return null
  const n = Number(s)
  if (!Number.isSafeInteger(n) || n < 0) return null
  return n
}

export default function CashBreakdown() {
  const [rows, setRows] = useState<DetailRow[]>([])
  const [nameNew, setNameNew] = useState('')
  const [amountNew, setAmountNew] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // 仍保留錯誤判斷，但畫面不顯示「狀態」欄
  const validRows = useMemo(() => rows.filter(r => !r.錯誤), [rows])

  const summary = useMemo(() => {
    const total = { d1000: 0, d500: 0, d100: 0, d50: 0, d10: 0, d5: 0, d1: 0, 金額合計: 0 }
    for (const r of validRows) {
      total.d1000 += r.d1000
      total.d500  += r.d500
      total.d100  += r.d100
      total.d50   += r.d50
      total.d10   += r.d10
      total.d5    += r.d5
      total.d1    += r.d1
      total.金額合計 += r.總金額
    }
    return total
  }, [validRows])

  function addOne(name: string, amountStr: string) {
    const amt = normalizeInt(amountStr)
    if (!name.trim()) {
      setRows(r => [...r, { 姓名: name, 總金額: 0, d1000:0,d500:0,d100:0,d50:0,d10:0,d5:0,d1:0, 錯誤:'姓名不可空白' }])
      return
    }
    if (amt === null) {
      setRows(r => [...r, { 姓名: name.trim(), 總金額: 0, d1000:0,d500:0,d100:0,d50:0,d10:0,d5:0,d1:0, 錯誤:'薪資需為非負整數' }])
      return
    }
    const br = greedyBreakdown(amt)
    setRows(r => [...r, {
      姓名: name.trim(),
      總金額: amt,
      d1000: br.d1000, d500: br.d500, d100: br.d100, d50: br.d50, d10: br.d10, d5: br.d5, d1: br.d1,
    }])
  }

  async function handleUpload(file: File) {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

    const next: DetailRow[] = []
    for (const row of raw) {
      const name = String(row['姓名'] ?? '').trim()
      const amt = normalizeInt(row['薪資'])
      if (!name) {
        next.push({ 姓名: String(row['姓名'] ?? ''), 總金額: 0, d1000:0,d500:0,d100:0,d50:0,d10:0,d5:0,d1:0, 錯誤:'姓名不可空白' })
        continue
      }
      if (amt === null) {
        next.push({ 姓名: name, 總金額: 0, d1000:0,d500:0,d100:0,d50:0,d10:0,d5:0,d1:0, 錯誤:'薪資需為非負整數' })
        continue
      }
      const br = greedyBreakdown(amt)
      next.push({
        姓名: name,
        總金額: amt,
        d1000: br.d1000, d500: br.d500, d100: br.d100, d50: br.d50, d10: br.d10, d5: br.d5, d1: br.d1,
      })
    }
    setRows(next)
  }

  function downloadExcel() {
    if (!validRows.length) { alert('沒有可匯出的資料'); return }

    // ===== 明細（移除「總件數」欄）=====
    const detailAoA = [
      ['姓名','總金額','1000','500','100','50','10','5','1'],
      ...validRows.map(r => [r.姓名, r.總金額, r.d1000, r.d500, r.d100, r.d50, r.d10, r.d5, r.d1]),
    ]

    // ===== 統整（移除「合計件數」列）=====
    const sumAoA = [
      ['面額','需求數量','金額小計'],
      [1000, summary.d1000, summary.d1000 * 1000],
      [500 , summary.d500 , summary.d500  * 500 ],
      [100 , summary.d100 , summary.d100  * 100 ],
      [50  , summary.d50  , summary.d50   * 50  ],
      [10  , summary.d10  , summary.d10   * 10  ],
      [5   , summary.d5   , summary.d5    * 5   ],
      [1   , summary.d1   , summary.d1    * 1   ],
      [],
      ['合計金額', summary.金額合計],
    ]

    const wb = XLSX.utils.book_new()
    const wsDetail = XLSX.utils.aoa_to_sheet(detailAoA)
    const wsSum = XLSX.utils.aoa_to_sheet(sumAoA)
    XLSX.utils.book_append_sheet(wb, wsDetail, '明細')
    XLSX.utils.book_append_sheet(wb, wsSum, '統整')

    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    saveAs(new Blob([out], { type: 'application/octet-stream' }), 'cash-breakdown.xlsx')
  }

  return (
    <div className="grid">
      {/* 左：輸入區 */}
      <div className="card">
        <div className="card-h">上傳／新增資料</div>
        <div className="card-c">
          <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
            <input
              ref={fileRef}
              className="file-compact"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
            />
            <button
              className="btn"
              onClick={() => { if(fileRef.current) fileRef.current.value = ''; setRows([]) }}
            >
              清空列表
            </button>
          </div>

          <div
            style={{
              marginTop:12,
              display:'grid',
              gridTemplateColumns:'75px 1fr 135px',
              gap:8,
              alignItems:'center'
            }}
          >
            <label style={{textAlign:'right'}}>手動新增</label>
            <div style={{display:'flex', gap:8}}>
              <input
                placeholder="姓名"
                value={nameNew}
                onChange={e=>setNameNew(e.target.value)}
              />
              <input
                placeholder="薪資（整數）"
                inputMode="numeric"
                value={amountNew}
                onChange={e=>setAmountNew(e.target.value)}
              />
            </div>
            <button
              className="btn primary"
              style={{ minWidth: 90 }}
              onClick={()=>{
                addOne(nameNew, amountNew)
                setNameNew(''); setAmountNew('')
              }}
            >
              加入
            </button>
          </div>

          <ol className="muted" style={{marginTop:12}}>
            <li>Excel/CSV 首列需為標題；必要欄位：姓名、薪資（整數）。</li>
            <li>面額固定為 1000/500/100/50/10/5/1；採用貪婪法（最少件數、鈔票優先）。</li>
          </ol>
        </div>
      </div>

      {/* 右：統整＋匯出（保留） */}
      <div className="card">
        <div className="card-h">統整與匯出</div>
        <div className="card-c">
          <div className="summary-grid">
            <div className="sum-item"><div className="k">1000</div><div className="v">{summary.d1000}</div></div>
            <div className="sum-item"><div className="k">500</div><div className="v">{summary.d500}</div></div>
            <div className="sum-item"><div className="k">100</div><div className="v">{summary.d100}</div></div>
            <div className="sum-item"><div className="k">50</div><div className="v">{summary.d50}</div></div>
            <div className="sum-item"><div className="k">10</div><div className="v">{summary.d10}</div></div>
            <div className="sum-item"><div className="k">5</div><div className="v">{summary.d5}</div></div>
            <div className="sum-item"><div className="k">1</div><div className="v">{summary.d1}</div></div>
          </div>

          <div style={{display:'flex', gap:16, marginTop:10, flexWrap:'wrap'}}>
            <div className="badge">合計金額：{summary.金額合計.toLocaleString()}</div>
            {/* 「合計件數」已移除 */}
          </div>

          <div style={{display:'flex', justifyContent:'flex-end', marginTop:12}}>
            <button className="btn primary" onClick={downloadExcel} disabled={!validRows.length}>
              下載 Excel
            </button>
          </div>
        </div>
      </div>

      {/* 明細預覽（移除「總件數」「狀態」欄） */}
      <div className="card" style={{gridColumn:'1 / -1'}}>
        <div className="card-h">明細預覽（{rows.length} 筆）</div>
        <div className="card-c">
          <div className="table-wrap">
            <table className="tbl tbl-cash">
  {/* 固定每一欄的寬度 */}
  <colgroup>
    <col className="col-name" />
    <col className="col-amount" />
    {([1000, 500, 100, 50, 10, 5, 1] as const).map(d => (
      <col key={d} className="col-denom" />
    ))}
  </colgroup>

  <thead>
    <tr>
      <th className="name">姓名</th>
      <th className="num">總金額</th>
      <th className="num">1000</th>
      <th className="num">500</th>
      <th className="num">100</th>
      <th className="num">50</th>
      <th className="num">10</th>
      <th className="num">5</th>
      <th className="num">1</th>
    </tr>
  </thead>
  <tbody>
    {rows.map((r, i) => (
      <tr key={i} className={r.錯誤 ? 'row-error' : ''}>
        <td className="name">{r.姓名}</td>
        <td className="num">{r.總金額.toLocaleString()}</td>
        <td className="num">{r.d1000}</td>
        <td className="num">{r.d500}</td>
        <td className="num">{r.d100}</td>
        <td className="num">{r.d50}</td>
        <td className="num">{r.d10}</td>
        <td className="num">{r.d5}</td>
        <td className="num">{r.d1}</td>
      </tr>
    ))}
    {!rows.length && (
      <tr>
        <td colSpan={9} style={{ textAlign: 'center' }} className="muted">
          尚無資料，請上傳或手動新增。
        </td>
      </tr>
    )}
  </tbody>
</table>

          </div>
        </div>
      </div>
    </div>
  )
}
