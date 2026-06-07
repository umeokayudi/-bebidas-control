import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmtYen, fmtDate, Spinner, Empty, SectionTitle } from './utils'

const TAX_RATE = 0.10

export default function RyoshushoTab() {
  const [bars,      setBars]      = useState([])
  const [vendas,    setVendas]    = useState([])
  const [history,   setHistory]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [generating,setGenerating]= useState(false)

  const [barId,     setBarId]     = useState('')
  const [numero,    setNumero]    = useState('')
  const [dataEmis,  setDataEmis]  = useState(new Date().toISOString().slice(0,10))
  const [periodoIni,setPeriodoIni]= useState('')
  const [periodoFim,setPeriodoFim]= useState('')
  const [emitNome,  setEmitNome]  = useState('JBM')
  const [emitReg,   setEmitReg]   = useState('T1234567890123')
  const [emitEnd,   setEmitEnd]   = useState('')
  const [emitTel,   setEmitTel]   = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [bRes, vRes, hRes] = await Promise.all([
        supabase.from('bars').select('*').order('nome'),
        supabase.from('vendas').select('*, vendas_itens(*, produtos(*))').order('data'),
        supabase.from('ryoshusho').select('*, bars(nome)').order('criado_em', { ascending: false }).limit(50),
      ])
      const b = bRes.data || []
      const v = vRes.data || []
      const h = hRes.data || []
      setBars(b)
      setVendas(v)
      setHistory(h)
      if (b.length > 0 && !barId) setBarId(b[0].id)
      const y = new Date().getFullYear()
      const m = String(new Date().getMonth() + 1).padStart(2, '0')
      const n = String(h.length + 1).padStart(3, '0')
      setNumero('RY-' + y + m + '-' + n)
    } catch(e) {
      console.error('loadAll error:', e)
    } finally {
      setLoading(false)
    }
  }

  function getItems() {
    if (!barId || !periodoIni || !periodoFim) return []
    return vendas
      .filter(v => v.bar_id === barId && v.data >= periodoIni && v.data <= periodoFim)
      .flatMap(v => (v.vendas_itens || []).map(it => ({
        nome: it.produtos?.nome || '?',
        qtd: it.qtd,
        preco: it.preco_unitario || it.produtos?.preco_venda || 0
      })))
      .reduce((acc, it) => {
        const ex = acc.find(x => x.nome === it.nome)
        if (ex) { ex.qtd += it.qtd }
        else acc.push({...it})
        return acc
      }, [])
  }

  const items = getItems()
  const subtotal = items.reduce((a, it) => a + it.preco * it.qtd, 0)
  const tax = Math.round(subtotal * TAX_RATE)
  const total = subtotal + tax
  const bar = bars.find(b => b.id === barId)

  async function saveAndDownload() {
    if (!barId || !periodoIni || !periodoFim) return alert('Select bar and period first')
    if (items.length === 0) return alert('No sales found for this period')
    setGenerating(true)

    try {
      await supabase.from('ryoshusho').insert({
        numero, bar_id: barId,
        data_emissao: dataEmis,
        periodo_inicio: periodoIni,
        periodo_fim: periodoFim,
        subtotal, consumo_tax: tax, total,
        emitente_nome: emitNome,
        emitente_endereco: emitEnd,
        emitente_tel: emitTel,
        emitente_registro: emitReg,
        itens: items
      })
    } catch(e) {}

    const rows = items.map(it =>
      '<tr><td>' + it.nome + '</td><td style="text-align:center">' + it.qtd +
      '</td><td style="text-align:right">&#165;' + Number(it.preco).toLocaleString('ja-JP') +
      '</td><td style="text-align:right">&#165;' + Number(it.preco * it.qtd).toLocaleString('ja-JP') + '</td></tr>'
    ).join('')

    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + numero + '</title>' +
      '<style>' +
      'body{font-family:serif;padding:40px;max-width:680px;margin:0 auto;color:#111}' +
      'h1{text-align:center;font-size:26px;letter-spacing:10px;margin-bottom:24px}' +
      '.row{display:flex;justify-content:space-between;margin-bottom:16px;font-size:13px}' +
      '.client{font-size:18px;font-weight:bold;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:14px}' +
      '.box{border:2px solid #111;padding:14px;text-align:center;margin:16px 0;font-size:20px;font-weight:bold}' +
      'table{width:100%;border-collapse:collapse;margin:16px 0}' +
      'th{background:#001028;color:white;padding:8px;text-align:left;font-size:12px}' +
      'td{padding:7px 8px;border-bottom:1px solid #ddd;font-size:13px}' +
      '.totals td{font-size:13px;padding:5px 8px}' +
      '.footer{text-align:center;margin-top:24px;font-size:12px;color:#666}' +
      '@page{size:A4;margin:15mm}' +
      '@media print{body{padding:0}}' +
      '</style></head><body>' +
      '<h1>&#9領&#12288;収&#12288;書</h1>' +
      '<div class="row"><span>No. <strong>' + numero + '</strong></span>' +
      '<span>&#30330;&#34892;&#26085;&#65306;<strong>' + new Date(dataEmis + 'T12:00').toLocaleDateString('ja-JP') + '</strong></span></div>' +
      '<div class="client">' + (bar ? bar.nome : '') + '&#12288;&#24481;&#20013;</div>' +
      (periodoIni ? '<div style="font-size:12px;color:#666;margin-bottom:14px">&#23550;&#35937;&#26399;&#38291;&#65306;' + periodoIni + '&#12288;&#65374;&#12288;' + periodoFim + '</div>' : '') +
      '<div class="box">&#21512;&#35336;&#37329;&#39069;&#12288;&#165; ' + Number(total).toLocaleString('ja-JP') + '&#12288;&#65288;&#31税;&#36796;&#65289;</div>' +
      '<table><thead><tr><th>&#21697;&#30446;</th><th>&#25968;&#37327;</th><th>&#21333;&#20385;</th><th>&#37329;&#39069;</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<table class="totals"><tr><td>&#23567;&#35336;</td><td style="text-align:right">&#165;' + Number(subtotal).toLocaleString('ja-JP') + '</td></tr>' +
      '<tr><td>&#28040;&#36027;&#31290;&#65288;10%&#65289;</td><td style="text-align:right">&#165;' + Number(tax).toLocaleString('ja-JP') + '</td></tr>' +
      '<tr><td><strong>&#21512;&#35336;</strong></td><td style="text-align:right"><strong>&#165;' + Number(total).toLocaleString('ja-JP') + '</strong></td></tr></table>' +
      '<div class="footer">&#19978;&#35352;&#12398;&#37329;&#39069;&#12434;&#27491;&#12395;&#9領;&#21463;&#12356;&#12383;&#12375;&#12414;&#12375;&#12383;<br><br>' +
      emitNome + (emitEnd ? '&#12288;' + emitEnd : '') + (emitTel ? '&#12288;TEL:' + emitTel : '') +
      '</div></body></html>'

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = numero + '.html'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    setGenerating(false)
    loadAll()
  }

  if (loading) return <Spinner text="Loading..." />

  return (
    <div className="fade-in">
      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle>領収書 — Issue Receipt</SectionTitle>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
          <div>
            <label className="form-label">Bar / Client</label>
            <select value={barId} onChange={e => setBarId(e.target.value)}>
              {bars.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Issue date</label>
            <input type="date" value={dataEmis} onChange={e => setDataEmis(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Document No.</label>
            <input type="text" value={numero} onChange={e => setNumero(e.target.value)} />
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <div>
            <label className="form-label">Period start</label>
            <input type="date" value={periodoIni} onChange={e => setPeriodoIni(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Period end</label>
            <input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)} />
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginBottom:12 }}>
          <div>
            <label className="form-label">Company name</label>
            <input type="text" value={emitNome} onChange={e => setEmitNome(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Reg. No.</label>
            <input type="text" value={emitReg} onChange={e => setEmitReg(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Address</label>
            <input type="text" value={emitEnd} onChange={e => setEmitEnd(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Phone</label>
            <input type="text" value={emitTel} onChange={e => setEmitTel(e.target.value)} />
          </div>
        </div>

        {periodoIni && periodoFim && (
          <div style={{ background:'var(--bg3)', borderRadius:8, padding:'12px 14px', marginBottom:12, fontSize:13 }}>
            <div style={{ fontWeight:600, marginBottom:8, fontSize:11, color:'var(--text2)', textTransform:'uppercase' }}>
              Items for period
            </div>
            {items.length === 0
              ? <span style={{ color:'var(--text2)' }}>No sales found for this bar/period</span>
              : items.map((it, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span>{it.nome} &times; {it.qtd}</span>
                  <span>{fmtYen(it.preco * it.qtd)}</span>
                </div>
              ))
            }
            {items.length > 0 && (
              <div style={{ borderTop:'0.5px solid var(--border)', marginTop:8, paddingTop:8, fontWeight:700 }}>
                Total (incl. 10% tax): {fmtYen(total)}
              </div>
            )}
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button className="btn-primary" onClick={saveAndDownload} disabled={generating}>
            {generating ? <><span className="spinner"/> Saving...</> : '\uD83D\uDDA8 Save & Download'}
          </button>
        </div>
      </div>

      <div className="card">
        <SectionTitle>Issued receipts</SectionTitle>
        {history.length === 0
          ? <Empty text="No receipts issued yet" />
          : (
            <table>
              <thead>
                <tr><th>No.</th><th>Bar</th><th>Date</th><th>Period</th><th>Total</th></tr>
              </thead>
              <tbody>
                {history.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight:600, fontFamily:'monospace', fontSize:12 }}>{r.numero}</td>
                    <td>{r.bars?.nome || '—'}</td>
                    <td>{fmtDate(r.data_emissao)}</td>
                    <td style={{ fontSize:12, color:'var(--text2)' }}>
                      {r.periodo_inicio && r.periodo_fim
                        ? fmtDate(r.periodo_inicio) + ' ~ ' + fmtDate(r.periodo_fim)
                        : '—'}
                    </td>
                    <td style={{ fontWeight:700 }}>{fmtYen(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>
    </div>
  )
}
