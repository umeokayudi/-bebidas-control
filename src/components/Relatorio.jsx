import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmtYen, monthKey, monthLabel, fmtDate, Spinner, Empty, filterSupplierVendas, saleMonthKey, compraMonthKey } from './utils'
import { aggregateComprasItens } from '../lib/marginCost'
import { barCreditsForMonth, barCreditsList } from '../lib/barCredits'
import { aReceberForMonth, faturasAbertasMes } from '../lib/faturasMonth'
import { ryoshushoForMonth, ryoshushoMonthShare } from '../lib/reportPeriod'
import { loadAllCompras } from '../lib/loadCompras'
import { loadDashboard } from '../lib/loadDashboard'
import ComprasNotasSection from './ComprasNotasSection'
import { AdminPage, PortalKpi, PortalSurface } from './ui/PageLayout'

export default function RelatorioTab() {
  const [bars, setBars] = useState([])
  const [compras, setCompras] = useState([])
  const [vendas, setVendas] = useState([])
  const [ryoshusho, setRyoshusho] = useState([])
  const [faturas, setFaturas] = useState([])
  const [dashByMonth, setDashByMonth] = useState({})
  const [dashMonths, setDashMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [selMonth, setSelMonth] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [bR, vR, rR, fR, cData, dash] = await Promise.all([
      supabase.from('bars').select('id, nome, cor'),
      supabase.from('vendas').select('id, data, data_venda, total, bar_id, obs, origem, cast_id'),
      supabase.from('ryoshusho').select('*'),
      supabase.from('faturas').select('*, bars(nome)').order('data_vencimento', { ascending: false }),
      loadAllCompras(),
      loadDashboard().catch(() => null),
    ])
    setBars(bR.data || [])
    setCompras(cData || [])
    setVendas(filterSupplierVendas(vR.data || []))
    setRyoshusho(rR.data || [])
    setFaturas(fR.data || [])
    setDashByMonth(dash?.byMonth || {})
    setDashMonths(dash?.months || [])

    const months = [...new Set([
      ...(dash?.months || []),
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
    ...dashMonths,
    ...compras.map(compraMonthKey),
    ...vendas.map(v => monthKey(v.data)),
  ])].filter(Boolean).sort().reverse()

  const dash = dashByMonth[selMonth] || {}
  const comprasMes = compras.filter(c => compraMonthKey(c) === selMonth)
  const vendasMes = vendas.filter(v => saleMonthKey(v) === selMonth)
  const ryoMes = ryoshushoForMonth(ryoshusho, selMonth)

  const custoCompras = dash.compras ?? comprasMes.reduce((a, c) => a + (+c.total_real || 0), 0)
  const descontoTotal = comprasMes.reduce((a, c) => a + (+c.desconto_pontos || 0), 0)
  const creditoBar = barCreditsForMonth(selMonth)
  const creditosBar = barCreditsList(selMonth)

  const receitaTotal = dash.receita ?? vendasMes.reduce((a, v) => a + (+v.total || 0), 0)
  const faturamento = dash.faturamento ?? receitaTotal
  const lucroTotal = dash.lucroProjetado ?? dash.lucro ?? (receitaTotal - custoCompras)
  const margemGeral = dash.margem ?? (faturamento > 0 ? Math.round(lucroTotal / faturamento * 100) : 0)
  const aReceber = dash.aReceber ?? aReceberForMonth(faturas, selMonth)
  const faturasMes = faturasAbertasMes(faturas, selMonth)
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

  if (loading) return <Spinner text="Carregando relatório..." />

  return (
    <AdminPage
      title="Relatório"
      actions={
        <>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Mês:</span>
          <select value={selMonth} onChange={e => setSelMonth(e.target.value)} style={{ width: 'auto' }}>
            {allMonths.length === 0 && <option>Sem dados</option>}
            {allMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        <PortalKpi label="Compras (notas)" value={fmtYen(custoCompras)} color="var(--red)"
          sub={dash.comprasEstimadas ? `${comprasMes.length} ref. · custo est. jul/2026` : `${comprasMes.length} nota(s)`} />
        <PortalKpi label="Faturamento" value={fmtYen(faturamento)} color="var(--navy)"
          sub={`${vendasMes.length} entrega(s) · ${dash.comprasEstimadas ? 'pedidos/notas' : 'cobrança'}`} />
        <PortalKpi label="Lucro projetado" value={fmtYen(lucroTotal)} color="var(--green)"
          sub={`${margemGeral}% · fat. − custo`} />
        <PortalKpi label="A receber" value={fmtYen(aReceber)} color={aReceber > 0 ? 'var(--amber)' : 'var(--green)'}
          sub={faturasMes.length ? `${faturasMes.length} fatura(s) em aberto` : 'Nada pendente'} />
      </div>

      {(creditoBar > 0 || descontoTotal > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: creditoBar > 0 && descontoTotal > 0 ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 18 }}>
          {creditoBar > 0 && (
            <PortalKpi label="Pago direto pelo bar" value={fmtYen(creditoBar)} color="var(--navy)"
              sub="Compra paga pelo cliente (ex.: LM) — abate na fatura, não é lucro" />
          )}
          {descontoTotal > 0 && (
            <PortalKpi label="Pontos" value={fmtYen(descontoTotal)} color="var(--gold)"
              sub="desconto nas notas de compra" />
          )}
        </div>
      )}

      <ComprasNotasSection
        comprasMes={comprasMes}
        totalCompras={custoCompras}
        creditoBar={creditoBar}
        creditosBar={creditosBar}
      />

      <PortalSurface title="Vendas do mês">
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
      </PortalSurface>

      <PortalSurface title="Itens comprados — resumo">
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
      </PortalSurface>

      <PortalSurface title={`領収書 — ${monthLabel(selMonth)}`}>
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
      </PortalSurface>
    </AdminPage>
  )
}
