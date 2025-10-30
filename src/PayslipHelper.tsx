import React, { useEffect, useMemo, useRef, useState } from 'react'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

type TemplateKey = 'tpl1' | 'tpl2' | 'custom'


const BASE = import.meta.env.BASE_URL || '/';
const TEMPLATES = {
  tpl1: { label: '模板1：勞務所得(B+G+S)', url: `${BASE}templates/勞務所得(B+G+S).docx` },
  tpl2: { label: '模板2：預支獎金',        url: `${BASE}templates/預支獎金.docx` },
  custom: { label: '自訂上傳' },
} as const;

const INSTITUTIONS = [
  '府城長照有限公司附設臺南市私立鴻康居家長照機構',
  '府城長照有限公司附設臺南市私立寬澤居家長照機構',
  '府城長照有限公司附設臺南市私立謙益居家長照機構',
  '有限責任臺南市府城照顧服務勞動合作社附設臺南市私立府城居家長照機構',
]

// ===== 金額轉中文金融大寫 =====
const CN_NUM = ['零','壹','貳','參','肆','伍','陸','柒','捌','玖'] as const
const CN_UNIT = ['', '拾', '佰', '仟']
const CN_SECTION = ['', '萬', '億', '兆']

function numberToChineseUpper(n: number): string {
  if (!Number.isFinite(n)) return ''
  if (n === 0) return '零元整'
  if (n < 0) return '負' + numberToChineseUpper(-n)

  const integer = Math.floor(n)
  const fraction = Math.round((n - integer) * 100)

  const sectionToCN = (sec: number) => {
    let out = '', unitPos = 0, zero = true
    while (sec > 0) {
      const v = sec % 10
      if (v === 0) { if (!zero) { zero = true; out = CN_NUM[0] + out } }
      else { zero = false; out = CN_NUM[v] + CN_UNIT[unitPos] + out }
      unitPos++; sec = Math.floor(sec / 10)
    }
    return out.replace(/零+/g, '零').replace(/零$/g, '')
  }

  let temp = integer, unitSec = 0, intStr = ''
  while (temp > 0) {
    const sec = temp % 10000
    if (sec !== 0) {
      let secStr = sectionToCN(sec)
      if (unitSec > 0) secStr += CN_SECTION[unitSec]
      intStr = secStr + intStr
    } else if (intStr && !/^零/.test(intStr)) intStr = '零' + intStr
    unitSec++; temp = Math.floor(temp / 10000)
  }
  intStr = intStr.replace(/零+/g, '零').replace(/^零/, '')

  let fracStr = ''
  if (fraction > 0) {
    const jiao = Math.floor(fraction / 10), fen = fraction % 10
    if (jiao > 0) fracStr += CN_NUM[jiao] + '角'
    if (fen > 0) fracStr += CN_NUM[fen] + '分'
  }
  return intStr //+ '元' + (fracStr || '整')
}

function rocDateParts(d = new Date()) {
  const y = d.getFullYear() - 1911, m = d.getMonth() + 1, dd = d.getDate()
  return { 民國年: y.toString(), 月: m.toString(), 日: dd.toString() }
}

// 掃描模板中的 {變數}
async function extractPlaceholders(arrayBuffer: ArrayBuffer): Promise<string[]> {
  const zip = new PizZip(arrayBuffer)
  const xml = zip.file('word/document.xml')?.asText() || ''
  const tags = new Set<string>()
  const re = /\{([^}]+)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) tags.add(m[1].trim())
  return Array.from(tags)
}

// 從 public 取預載模板
async function fetchTemplate(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('載入模板失敗：' + url)
  return await res.arrayBuffer()
}

export default function PayslipHelper() {
  // 模板狀態
  const [selectedTpl, setSelectedTpl] = useState<TemplateKey>('tpl1')
  const [templateBuf, setTemplateBuf] = useState<ArrayBuffer | null>(null)
  const [templateName, setTemplateName] = useState<string>('')
  const [placeholders, setPlaceholders] = useState<string[]>([])

  // 區塊 2：機構與單張輸出
  const [org, setOrg] = useState<string>('')            // 可為空
  const [singleName, setSingleName] = useState('')
  const [singleSalary, setSingleSalary] = useState('')
  const [singleIdno, setSingleIdno] = useState('')

  // 新增：單張覆蓋用的年月（民國年、月），選填
  const [ymYear, setYmYear] = useState('')   // 例如 114
  const [ymMonth, setYmMonth] = useState('') // 1~12

  // 區塊 3：批次輸出
  const [batchOrg, setBatchOrg] = useState<string>('')
  const [batchFile, setBatchFile] = useState<File | null>(null)
  const batchInputRef = useRef<HTMLInputElement>(null)
  const [isBatchLoading, setIsBatchLoading] = useState(false)

  const amountUpper = useMemo(() => {
    const n = Number(singleSalary.toString().replace(/[,\\s]/g, ''))
    return Number.isFinite(n) ? numberToChineseUpper(n) : ''
  }, [singleSalary])

  const defaultData = useMemo(() => rocDateParts(), [])

  // 切換模板時自動載入（tpl1/tpl2）
  useEffect(() => {
    if (selectedTpl === 'custom') {
      setTemplateName(''); setPlaceholders([]); setTemplateBuf(null)
      return
    }
    const info = TEMPLATES[selectedTpl]
    if (!info.url) return
    fetchTemplate(info.url)
      .then(async (ab) => {
        setTemplateBuf(ab)
        setTemplateName(info.label + '.docx')
        setPlaceholders(await extractPlaceholders(ab))
      })
      .catch((e) => {
        console.error(e)
        alert('載入內建模板失敗，請確認檔案是否位於 public/templates/')
      })
  }, [selectedTpl])

  async function handleTemplateUpload(file: File) {
    const ab = await file.arrayBuffer()
    setTemplateBuf(ab)
    setTemplateName(file.name)
    setPlaceholders(await extractPlaceholders(ab))
    setSelectedTpl('custom')
  }

  function renderDocx(data: Record<string, any>, fileLabel: string) {
    if (!templateBuf) return alert('請先選擇或載入模板')
    const zip = new PizZip(templateBuf)
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
    doc.setData(data)
    try { doc.render() } catch (e: any) { alert('套版失敗：' + (e?.message || e)); return }
    const out = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    const base = (templateName || TEMPLATES[selectedTpl].label || '輸出').replace(/\.docx$/i, '')
    saveAs(out, `${base}-${fileLabel}.docx`)
  }

  function handleGenerateSingle() {
    if (!templateBuf) return alert('請先選擇或載入模板')
    if (!singleName || !singleSalary) return alert('請輸入姓名與薪資')
    const n = Number(singleSalary.toString().replace(/[,\\s]/g, ''))
    if (!Number.isFinite(n)) return alert('薪資需為數字')

    const data = {
      姓名: singleName,
      薪資: n.toString(),
      薪資數字大寫: numberToChineseUpper(n),
      身份證字號: singleIdno || '',
      機構: org || '',
      ...defaultData,
    }
    renderDocx(data, singleName)
  }

  async function handleBatchExcel(file: File) {
    if (!templateBuf) return alert('請先選擇或載入模板')
    if (!batchOrg) return alert('請先在「批次產出」選擇機構')

    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

    const zipOut = new JSZip()
    const base = (templateName || TEMPLATES[selectedTpl].label || '輸出').replace(/\.docx$/i, '')

    for (const row of rows) {
      const name = row['姓名']?.toString()?.trim()
      const salaryRaw = row['薪資']
      const upperRaw = row['薪資數字大寫']
      const idno = row['身份證字號']?.toString() || ''

      if (!name || salaryRaw === undefined || salaryRaw === null || salaryRaw === '') continue
      const n = Number(String(salaryRaw).replace(/[,\\s]/g, ''))
      if (!Number.isFinite(n)) continue

      const data = {
        姓名: name,
        薪資: n.toString(),
        薪資數字大寫: upperRaw ? String(upperRaw) : numberToChineseUpper(n),
        身份證字號: idno,
        機構: batchOrg,           // ★ 一律使用批次下拉的機構
        ...defaultData,
      }

      const zip = new PizZip(templateBuf!)
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
      doc.setData(data)
      try { doc.render() } catch (e) { console.error('渲染失敗：', name, e); continue }
      const blob = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      const fname = `${base}-${name}.docx`
      zipOut.file(fname, blob as any)
    }

    const zipBlob = await zipOut.generateAsync({ type: 'blob' })
    saveAs(zipBlob, `${base}-批次輸出.zip`)
  }

  // 清空「2) 機構與單張輸出」區塊
  function handleResetSection2() {
    setOrg('')
    setSingleName('')
    setSingleSalary('')
    setSingleIdno('')
  }

  // 清空全頁（保留所選模板）
  function handleResetAll() {
    setTemplateBuf(null); setTemplateName(''); setPlaceholders([])
    handleResetSection2()
    setBatchOrg('')
    setBatchFile(null)
    if (batchInputRef.current) batchInputRef.current.value = ''
  }

  // 模板 label 顯示：tpl1/tpl2 兩行，自訂一行
  const prettyLabel = (k: TemplateKey) => {
    if (k === 'tpl1') return '模板1：\n勞務所得(B+G+S)'
    if (k === 'tpl2') return '模板2：\n預支獎金'
    return '自訂上傳'
  }

  return (
    <div className="grid">
      {/* 1) 選擇模板（在寬螢幕時橫跨兩欄） */}
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div className="card-h">1) 選擇模板</div>
        <div className="card-c">
          <div style={{display:'flex', gap:16, flexWrap:'wrap', marginBottom:12}}>
            {(['tpl1','tpl2','custom'] as TemplateKey[]).map(k => (
              <label
                key={k}
                className="tpl-option"
                style={{
                  display:'flex',
                  alignItems:'center',
                  gap:8,
                  border:'1px solid var(--border)',
                  borderRadius:12,
                  padding:'10px 14px',
                  minWidth: 240,
                  maxWidth: 280,
                  background:'var(--surface)'
                }}
              >
                <input
                  type="radio"
                  name="tpl"
                  className="tpl-radio"
                  value={k}
                  checked={selectedTpl === k}
                  onChange={() => setSelectedTpl(k)}
                  style={{ margin:0 }}
                />
                <span
                  style={{
                    display:'block',
                    width:'100%',
                    whiteSpace:'pre-line',
                    lineHeight:1.4,
                    textAlign:'center'
                  }}
                >
                  {prettyLabel(k)}
                </span>
              </label>
            ))}
          </div>

          {selectedTpl === 'custom' && (
            <div style={{display:'flex', gap:12, alignItems:'center', marginTop:4}}>
              <input
                type="file" accept=".docx"
                className="file-compact"
                onChange={(e) => e.target.files && handleTemplateUpload(e.target.files[0])}
              />
              <span className="muted">已載入：{templateName || '（尚未選擇）'}</span>
            </div>
          )}

          <div className="muted" style={{marginTop:12}}>
            模板可使用變數：
            <code className="badge">{'{姓名}'}</code>{' '}
            <code className="badge">{'{薪資}'}</code>{' '}
            <code className="badge">{'{薪資數字大寫}'}</code>{' '}
            <code className="badge">{'{身份證字號}'}</code>{' '}
            <code className="badge">{'{民國年}'}</code>{' '}
            <code className="badge">{'{月}'}</code>{' '}
            <code className="badge">{'{日}'}</code>{' '}
            <code className="badge">{'{機構}'}</code>
          </div>

          <div style={{marginTop:10}}>
            <button className="btn" onClick={handleResetAll}>清空整頁表單</button>
          </div>
        </div>
      </div>

      {/* 2) 機構與單張輸出 */}
      <div className="card">
        <div className="card-h">2) 機構與單張輸出</div>
        <div className="card-c">
          <div className="row">
            <label>機構</label>
            <select
              value={org}
              onChange={(e)=>setOrg(e.target.value)}
              style={{
                background:'var(--surface)',
                color:'var(--text)',
                border:'1px solid var(--border)',
                borderRadius:10,
                padding:'10px 12px'
              }}
            >
              <option value="">（未選擇）</option>
              {INSTITUTIONS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div className="row">
  <label>年月（選填）</label>
  <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
    <input
      style={{width:120}}
      inputMode="numeric"
      placeholder="民國年"
      value={ymYear}
      onChange={(e)=> setYmYear(e.target.value.replace(/[^\d]/g,''))}
    />
    <span>年</span>
    <input
      style={{width:80}}
      inputMode="numeric"
      placeholder="月"
      value={ymMonth}
      onChange={(e)=> {
        const v = e.target.value.replace(/[^\d]/g,'')
        setYmMonth(v)
      }}
    />
    <span>月</span>
  </div>
</div>

          <div className="row">
            <label>姓名</label>
            <input value={singleName} onChange={e=>setSingleName(e.target.value)} placeholder="王小明" />
          </div>
          <div className="row">
            <label>薪資（數字）</label>
            <input value={singleSalary} onChange={e=>setSingleSalary(e.target.value)} placeholder="30000" />
          </div>
          <div className="row">
            <label>身份證字號（選填）</label>
            <input value={singleIdno} onChange={e=>setSingleIdno(e.target.value)} placeholder="A123456789" />
          </div>
          <div className="row" style={{alignItems:'start'}}>
            <label>薪資數字大寫（自動）</label>
            <textarea readOnly value={amountUpper} />
          </div>

          <div style={{display:'flex', justifyContent:'flex-end', gap:8}}>
            <button className="btn" onClick={handleResetSection2}>清除</button>
            <button className="btn primary" onClick={handleGenerateSingle}>輸出 .docx</button>
          </div>
        </div>
      </div>

      {/* 3) 批次輸出 */}
      <div className="card">
        <div className="card-h">3) 批次產出（Excel / CSV）</div>
        <div className="card-c">
          {/* 批次機構（必填） */}
          <div
            className="row"
            style={{ gridTemplateColumns: '65px minmax(0, 980px)' }}
          >
            <label style={{ textAlign: 'right' }}>選擇機構</label>
            <select
              value={batchOrg}
              onChange={(e)=>setBatchOrg(e.target.value)}
              style={{
                background:'var(--surface)',
                color:'var(--text)',
                border:'1px solid var(--border)',
                borderRadius:10,
                padding:'10px 12px',
                width:'100%',
                maxWidth:'1000px'
              }}
            >
              <option value="">（請選擇機構）</option>
              {INSTITUTIONS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>

          {/* 選檔 + 下載控制 */}
          <div style={{display:'flex', gap:12, alignItems:'center', marginTop:8, flexWrap:'wrap'}}>
            <input
              ref={batchInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="file-compact"
              style={{ flex: '0 0 auto' }}
              onChange={(e) => {
                const f = e.target.files?.[0] || null
                setBatchFile(f)
              }}
            />

            <span className="muted" style={{minWidth:180}}>
              {batchFile ? `已選：${batchFile.name}` : '尚未選擇檔案'}
            </span>

            <button
              className="btn primary"
              disabled={!templateBuf || !batchOrg || !batchFile || isBatchLoading}
              onClick={async () => {
                if (!templateBuf) { alert('請先選擇或載入模板'); return }
                if (!batchOrg) { alert('請先選擇機構'); return }
                if (!batchFile) { alert('請先選擇 Excel/CSV 檔'); return }
                try {
                  setIsBatchLoading(true)
                  await handleBatchExcel(batchFile)
                } finally {
                  setIsBatchLoading(false)
                  setBatchFile(null)
                  if (batchInputRef.current) batchInputRef.current.value = ''
                }
              }}
              style={{ display:'inline-flex', alignItems:'center', gap:8 }}
            >
              {isBatchLoading ? (
                <>
                  {/* SVG 轉圈圈，不需額外 CSS */}
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.25"/>
                    <path d="M8 1 a7 7 0 0 1 7 7" stroke="currentColor" strokeWidth="2" fill="none">
                      <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.9s" repeatCount="indefinite"/>
                    </path>
                  </svg>
                  產生中…
                </>
              ) : '產生並下載 ZIP'}
            </button>

            <a className="btn" href="/sample.xlsx" download>範本</a>
          </div>

          <div className="muted" style={{marginTop:8}}>
            Excel 欄位：姓名（必）、薪資（必）、薪資數字大寫（選）、身份證字號（選）。本批次將套用上方「批次機構」。
          </div>
        </div>
      </div>
    </div>
  )
}
