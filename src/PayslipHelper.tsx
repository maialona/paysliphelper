// src/PayslipHelper.tsx
import React, { useEffect, useMemo, useState } from 'react'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

type TemplateKey = 'tpl1' | 'tpl2' | 'custom'

const TEMPLATES: Record<TemplateKey, { label: string; url?: string }> = {
  tpl1: { label: '模板1：勞務所得(B+G+S)', url: '/templates/勞務所得(B+G+S).docx' },
  tpl2: { label: '模板2：預支獎金',        url: '/templates/預支獎金.docx' },
  custom: { label: '自訂上傳' },
}

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
  return intStr + '元' + (fracStr || '整')
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

  // 區塊 3：批次輸出的機構（必填）
  const [batchOrg, setBatchOrg] = useState<string>('')

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

    // 必填：批次機構
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
                style={{
                  display:'flex',
                  alignItems:'center',
                  gap:8,
                  border:'1px solid var(--border)',
                  borderRadius:12,
                  padding:'10px 14px',
                  minWidth: 240,
                  maxWidth: 280,
                  background:'var(--surface)'  // 主題變數
                }}
              >
                <input
                  type="radio"
                  name="tpl"
                  value={k}
                  checked={selectedTpl === k}
                  onChange={() => setSelectedTpl(k)}
                  style={{ transform:'scale(0.9)', margin:0 }}
                />
                <span
                  style={{
                    display:'block',
                    width:'100%',
                    whiteSpace:'pre-line',   // 讓 \n 換行
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
              <input type="file" accept=".docx" onChange={(e) => e.target.files && handleTemplateUpload(e.target.files[0])} />
              <span className="muted">已載入：{templateName || '（尚未選擇）'}</span>
            </div>
          )}

          {/* 只保留提示用徽章；實際掃描結果不再顯示 XML */}
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

          {/* 右下角：清除（清本卡片欄位）＋ 輸出 */}
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
  // 讓右側欄位更長：第二欄改成固定可達更寬的 minmax
  style={{ gridTemplateColumns: '120px minmax(0, 980px)' }}
>
  <label style={{ textAlign: 'left' }}>選擇機構</label>
  <select
    value={batchOrg}
    onChange={(e)=>setBatchOrg(e.target.value)}
    style={{
      background:'var(--surface)',
      color:'var(--text)',
      border:'1px solid var(--border)',
      borderRadius:10,
      padding:'10px 12px',
      width:'100%',        // 吃滿這一欄
      maxWidth:'1000px'     // 上限（可自行再放大）
    }}
  >
    <option value="">（請選擇機構）</option>
    {INSTITUTIONS.map(x => <option key={x} value={x}>{x}</option>)}
  </select>
</div>

<div style={{display:'flex', gap:12, alignItems:'center', marginTop:8}}>
  <input
    type="file" accept=".xlsx,.xls,.csv"
    style={{ flex: '1 1 600px' }}   // 600px 為預設基準寬，會隨容器伸縮
  />
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
