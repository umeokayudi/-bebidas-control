import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmtYen, monthKey, monthLabel, fmtDate, Spinner, Empty, SectionTitle, filterSupplierVendas, saleMonthKey, compraMonthKey } from './utils'
import { aggregateComprasItens } from '../lib/marginCost'
import { barCreditsForMonth, barCreditsList } from '../lib/barCredits'
import { ryoshushoForMonth, ryoshushoMonthShare } from '../lib/reportPeriod'
import { loadAllCompras } from '../lib/loadCompras'
import ComprasNotasSection from './ComprasNotasSection'

function MetricCard({ label, value, sub, color = 'var(--navy)', accent }) {
  return (
    <div style={{
      background: 'var(--bg2)', borderRadius: 14, padding: '18px 20px',
      border: '1px solid var(--border)', position: 'relative', overflow: 'hidden',
    }}>
      {accent && <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: accent, borderRadius: '14px 0 0 14px' }} />}
      <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

export default function RelatorioTab() {
  const [bars, setBars] = useState([])
  const [compras, setCompras] = useState([])
  const [vendas, setVendas] = useState([])
  const [ryoshusho, setRyoshusho] = useState([])
  const [loading, setLoading] = useState(true)
  const [selMonth, setSelMonth] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [bR, vR, rR, cData] = await Promise.all([
      supabase.from('bars').select('id, nome, cor'),
      supabase.from('vendas').select('id, data, data_venda, total, bar_id, obs, origem, cast_id'),
      supabase.from('ryoshusho').select('*'),
      loadAllCompras(),
    ])
    setBars(bR.data || [])
    setCompras(cData || [])
    setVendas(filterSupplierVendas(vR.data || []))
    setRyoshusho(rR.data || [])

    const months = [...new Set([
      ...(cData || []).map(compraMonthKey),
      ...(vR.data || []).map(v => monthKey(v.data)),
    ])].filter(Boolean).sort().reverse()

    let initialMonth = months[0] || ''
    try {
      const saved = sessionStorage.getItem('relatorioMonth')
      if (saved && months.includes(saved)) initialMonth = saved
      sessionStorage.removeItem('relatorioMonth')
    } catch {}
    if (initialMonth) setSelMonth(initialMonth)
    setLoading(false)
  }

  const allMonths = [...new Set([
    ...compras.map(compraMonthKey),
    ...vendas.map(v => monthKey(v.data)),
  ])].filter(Boolean).sort().reverse()

  const comprasMes = compras.filter(c => compraMonthKey(c) === selMonth)
  const vendasMes = vendas.filter(v => saleMonthKey(v) === selMonth)
  const ryoMes = ryoshushoForMonth(ryoshusho, selMonth)

  const custoCompras = comprasMes.reduce((a, c) => a + (+c.total_real || 0), 0)
  const descontoTotal = comprasMes.reduce((a, c) => a + (+c.desconto_pontos || 0), 0)
  const creditoBar = barCreditsForMonth(selMonth)
  const creditosBar = barCreditsList(selMonth)

  const receitaTotal = vendasMes.reduce((a, v) => a + (+v.total || 0), 0)
  const lucroTotal = receitaTotal - custoCompras
  const lucroJbmTotal = lucroTotal + creditoBar
  const margemGeral = receitaTotal > 0 ? Math.round(lucroTotal / receitaTotal * 100) : 0
  const margemJbmGeral = receitaTotal > 0 ? Math.round(lucroJbmTotal / receitaTotal * 100) : 0
  const ryoTotal = ryoMes.reduce((a, r) => a + ryoshushoMonthShare(r, selMonth), 0)

  const porProdutoComprado = aggregateComprasItens(comprasMes)

  const vendasDetalhe = vendasMes
    .map(v => {
      const bar = bars.find(b => b.id === v.bar_id)
      return {
        id: v.id,
        data: v.data,
        barNome: bar?.nome || '—',
        barCor: bar?.cor,
        receita: +v.total || 0,
        obs: v.obs,
      }
    })
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))

  if (loading) return <Spinner text="Loading report..." />

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Mês:</span>
        <select value={selMonth} onChange={e => setSelMonth(e.target.value)} style={{ width: 'auto' }}>
          {allMonths.length === 0 && <option>Sem dados</option>}
          {allMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
        <MetricCard label="Compras (notas)" value={fmtYen(custoCompras)} color="var(--red)" accent="var(--red)"
          sub={`${comprasMes.length} nota(s)`} />
        <MetricCard label="Receita" value={fmtYen(receitaTotal)} color="var(--navy)" accent="var(--navy)"
          sub={`${vendasMes.length} venda(s)`} />
        <MetricCard label="Lucro" value={fmtYen(lucroTotal)} color="var(--green)" accent="var(--green)"
          sub={`${margemGeral}% · receita − notas`} />
      </div>

      {(creditoBar > 0 || descontoTotal > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: creditoBar > 0 ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 18 }}>
          {creditoBar > 0 && (
            <MetricCard label="Lucro JBM" value={fmtYen(lucroJbmTotal)} color="var(--green)" accent="var(--green)"
              sub={`+${fmtYen(creditoBar)} crédito bar · ${margemJbmGeral}%`} />
          )}
          {descontoTotal > 0 && (
            <MetricCard label="Pontos" value={fmtYen(descontoTotal)} color="var(--gold)" accent="var(--gold)"
              sub="desconto nas notas" />
          )}
        </div>
      )}

      <ComprasNotasSection
        comprasMes={comprasMes}
        totalCompras={custoCompras}
        creditoBar={creditoBar}
        creditosBar={creditosBar}
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle>Vendas do mês</SectionTitle>
        {vendasDetalhe.length === 0 ? <Empty text="Nenhuma venda neste mês" /> : (
          <table>
            <thead>
              <tr><th>Data</th><th>Bar</th><th>Obs</th><th style={{ textAlign: 'right' }}>Receita</th></tr>
            </thead>
            <tbody>
              {vendasDetalhe.map(v => (
                <tr key={v.id}>
                  <td>{fmtDate(v.data)}</td>
                  <td style={{ color: v.barCor || 'var(--navy)', fontWeight: 600 }}>{v.barNome}</td>
                  <td style={{ fontSize: 11, color: 'var(--text2)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.obs || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtYen(v.receita)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ fontWeight: 700 }}>Total ({vendasDetalhe.length})</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--navy)' }}>{fmtYen(receitaTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle>Itens comprados — resumo</SectionTitle>
        {porProdutoComprado.length === 0 ? <Empty text="Nenhum item nas notas" /> : (
          <table>
            <thead>
              <tr><th>Produto</th><th style={{ textAlign: 'right' }}>Qtd</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Médio</th></tr>
            </thead>
            <tbody>
              {porProdutoComprado.map(p => (
                <tr key={p.nome}>
                  <td>{p.nome}</td>
                  <td style={{ textAlign: 'right' }}>{p.qtd}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{fmtYen(p.custoTotal)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{p.qtd ? fmtYen(Math.round(p.custoTotal / p.qtd)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle>領収書 — {monthLabel(selMonth)}</SectionTitle>
        {ryoMes.length === 0 ? (
          <Empty text="Nenhum 領収書 neste mês" />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
              <span>Parte do mês: <strong style={{ color: 'var(--gold)' }}>{fmtYen(ryoTotal)}</strong></span>
              <span>Receita: <strong>{fmtYen(receitaTotal)}</strong></span>
            </div>
            {ryoMes.map(r => {
              const share = ryoshushoMonthShare(r, selMonth)
              const bar = bars.find(b => b.id === r.bar_id)
              return (
                <div key={r.id} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 6, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>{bar?.nome || '—'} · {r.numero || '—'}</span>
                    <span style={{ color: 'var(--gold)' }}>{fmtYen(share)}</span>
                  </div>
                  <div style={{ color: 'var(--text2)', marginTop: 2 }}>
                    {fmtDate(r.periodo_inicio)} – {fmtDate(r.periodo_fim)}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
