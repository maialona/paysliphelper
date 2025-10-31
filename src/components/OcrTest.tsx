import React, { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import Tesseract from 'tesseract.js'

type Row = {
  姓名: string
  總金額: number
  d1000: number
  d500: number
  d100: number
  d50: number
  d10: number
  d5: number
  d1: number
  來源檔名?: string
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

function normalizeInt(input: string): number | null {
  const s = input.replace(/[^\d]/g, '')
  if (!s) return null
  const n = Number(s)
  if (!Number.isSafeInteger(n) || n < 0) return null
  return n
}

/** 嘗試從一段 OCR 文字中抓「姓名 + 數字」或僅「數字」 */
function parseOCRText(text: string, srcName: string): Row[] {
  const out: Row[] = []

  // 1) 先粗切行
  const lines = text
    .split(/\r?\n/)
    .map(s => s.replace(/[^\p{Letter}\p{Number}\s，,．.]/gu, '').trim())
    .filter(Boolean)

  // 2) 逐行偵測
  for (const raw of lines) {
    const s = raw.replace(/[．]/g, '.').replace(/，/g, ',').trim()

    // 形式 A：姓名 + 金額（姓名是中文或夾少量空白、金額在行尾）
    // ex: "郭昭德 54165"、"林依菱 53,493"
    const mA = s.match(/^([\p{Script=Han}A-Za-z\s]{1,12})\s*([0-9][0-9,]{2,})$/u)
    if (mA) {
      const name = mA[1].replace(/\s+/g, '').trim()
      const n = normalizeInt(mA[2])
      if (n !== null) {
        const br = greedyBreakdown(n)
        out.push({ 姓名: name || '', 總金額: n, ...br, 來源檔名: srcName })
        continue
      }
    }

    // 形式 B：僅有金額（你的第二張截圖就是一整欄的數字）
    const mB = s.match(/^([0-9][0-9,]{2,})$/)
    if (mB) {
      const n = normalizeInt(mB[1])
      if (n !== null) {
        const br = greedyBreakdown(n)
        out.push({ 姓名: '', 總金額: n, ...br, 來源檔名: srcName })
      }
    }
  }

  return out
}

export default function OcrTest() {
  const [rows, setRows] = useState<Row[]>([])
  const [progress, setProgress] = useState(0)     // 0~100 整體進度
  const [currentFileName, setCurrentFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // ======= OCR 主流程（依序處理多張，進度為加權平均） =======
  async function handleImages(files: File[]) {
    if (!files.length) return
    setProgress(0)

    const total = files.length
    let acc: Row[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      setCurrentFileName(f.name)

      // 將 <=100KB 的極小圖略放大（能提高部分數字辨識）
      const imgUrl = URL.createObjectURL(f)

      // 以 chi_tra 優先，併 eng；logger 回報單張進度
      const result = await Tesseract.recognize(imgUrl, 'chi_tra+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            const base = (i / total) * 100
            const part = (m.progress || 0) * (100 / total)
            setProgress(Math.min(100, Math.round(base + part)))
          }
        }
      })

      URL.revokeObjectURL(imgUrl)

      // 解析文字
      const parsed = parseOCRText(result.data.text || '', f.name)
      acc = acc.concat(parsed)
    }

    setRows(acc)
    setProgress(100)
  }

  // ======= 事件：選檔 / 拖曳 =======
  function onSelectFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const fs = e.target.files ? Array.from(e.target.files) : []
    handleImages(fs)
  }
  function onDropFiles(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const fs = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'))
    handleImages(fs)
  }

  // ======= 清空 / 下載 =======
  function clearAll() {
    setRows([])
    setProgress(0)
    setCurrentFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function downloadExcel() {
    if (!rows.length) { alert('沒有可匯出的資料'); return }

    const detailAoA = [
      ['姓名','金額','1000','500','100','50','10','5','1','來源檔'],
      ...rows.map(r => [r.姓名, r.總金額, r.d1000, r.d500, r.d100, r.d50, r.d10, r.d5, r.d1, r.來源檔名 ?? '']),
    ]

    const s = summary
    const sumAoA = [
      ['面額','需求數量','金額小計'],
      [1000, s.d1000, s.d1000 * 1000],
      [500 , s.d500 , s.d500  * 500 ],
      [100 , s.d100 , s.d100  * 100 ],
      [50  , s.d50  , s.d50   * 50  ],
      [10  , s.d10  , s.d10   * 10  ],
      [5   , s.d5   , s.d5    * 5   ],
      [1   , s.d1   , s.d1    * 1   ],
      [],
      ['合計金額', s.total],
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailAoA), '明細')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumAoA), '統整')

    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    saveAs(new Blob([out], { type: 'application/octet-stream' }), 'ocr-breakdown.xlsx')
  }

  // ======= 統整 =======
  const summary = useMemo(() => {
    const t = { d1000:0, d500:0, d100:0, d50:0, d10:0, d5:0, d1:0, total:0 }
    for (const r of rows) {
      t.d1000 += r.d1000
      t.d500  += r.d500
      t.d100  += r.d100
      t.d50   += r.d50
      t.d10   += r.d10
      t.d5    += r.d5
      t.d1    += r.d1
      t.total += r.總金額
    }
    return t
  }, [rows])

  // ===================== UI =====================
  return (
    <div className="grid">
      {/* 左：OCR 測試 */}
      <div className="card">
        <div className="card-h">OCR 測試（上傳或拖曳圖片）</div>
        <div className="card-c">

          <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.heic"
              onChange={onSelectFiles}
              className="file-compact"
            />
            <span className="badge">{currentFileName || '未選擇任何檔案'}</span>
            <button className="btn" onClick={clearAll}>清空列表</button>
            <button className="btn primary" onClick={downloadExcel} disabled={!rows.length}>下載 Excel</button>
          </div>

          <div
            onDragOver={(e)=>e.preventDefault()}
            onDrop={onDropFiles}
            style={{
              marginTop:12,
              padding:'28px 14px',
              border:'2px dashed var(--border)',
              borderRadius:12,
              textAlign:'center',
              color:'var(--muted)'
            }}
          >
            將圖片拖曳到此處進行辨識（支援多張）
          </div>

          {/* 整體進度 */}
          <div style={{marginTop:14}}>
            <div style={{
              height:8, borderRadius:999, background:'color-mix(in srgb, var(--surface) 70%, var(--bg) 30%)',
              overflow:'hidden'
            }}>
              <div style={{
                width: `${progress}%`,
                height:'100%',
                background:'var(--btn-primary-bg)',
                transition:'width .2s ease'
              }} />
            </div>
            <div className="muted" style={{marginTop:6, textAlign:'right'}}>{progress}% done</div>
          </div>

        </div>
      </div>

      {/* 右：統整（sticky 讓它固定在上緣） */}
      <div className="card sticky">
        <div className="card-h">統整</div>
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

          <div style={{display:'flex', gap:12, marginTop:10, flexWrap:'wrap'}}>
            <div className="badge">合計金額：{summary.total.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* 下：辨識結果（跨兩欄） */}
      <div className="card" style={{gridColumn:'1 / -1'}}>
        <div className="card-h">辨識結果（{rows.length} 筆）</div>
        <div className="card-c">
          <div className="table-wrap">
            <table className="tbl tbl-cash">
              <colgroup>
                <col className="col-name" />
                <col className="col-amount" />
                {([1000, 500, 100, 50, 10, 5, 1] as const).map(d => <col key={d} className="col-denom" />)}
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th className="name">姓名</th>
                  <th className="num">金額</th>
                  <th className="num">1000</th>
                  <th className="num">500</th>
                  <th className="num">100</th>
                  <th className="num">50</th>
                  <th className="num">10</th>
                  <th className="num">5</th>
                  <th className="num">1</th>
                  <th>來源檔</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="name">{r.姓名 || '（空）'}</td>
                    <td className="num">{r.總金額.toLocaleString()}</td>
                    <td className="num">{r.d1000}</td>
                    <td className="num">{r.d500}</td>
                    <td className="num">{r.d100}</td>
                    <td className="num">{r.d50}</td>
                    <td className="num">{r.d10}</td>
                    <td className="num">{r.d5}</td>
                    <td className="num">{r.d1}</td>
                    <td className="muted">{r.來源檔名 ?? ''}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={10} className="muted" style={{textAlign:'center'}}>
                      尚無資料，請上傳或拖曳圖片。
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
