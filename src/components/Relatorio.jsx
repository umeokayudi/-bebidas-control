import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { fmtYen, monthKey, monthLabel, fmtDate, Spinner, Empty, SectionTitle, filterSupplierVendas, saleMonthKey, compraMonthKey } from './utils'
import { buildPurchaseCostIndex, buildPedidoByVendaPrefix, marginFromSales, marginFromPedidoItens, allocateInvoiceCost, aggregateComprasItens } from '../lib/marginCost'
import { pedidoSaleDate } from '../lib/pedidoVenda'
import { barCreditsForMonth, barCreditsList } from '../lib/barCredits'
import { ryoshushoForMonth, ryoshushoMonthShare } from '../lib/reportPeriod'
import { loadAllCompras } from '../lib/loadCompras'
import ComprasNotasSection from './ComprasNotasSection'

function pedidoMonthKey(p) {
  return monthKey(pedidoSaleDate(p))
}

function MetricCard({ label, value, sub, color='var(--navy)', accent }) {
  return (
    <div style={{
      background:'var(--bg2)', borderRadius:14, padding:'18px 20px',
      border:'1px solid var(--border)', position:'relative', overflow:'hidden'
    }}>
      {accent && <div style={{ position:'absolute', top:0, left:0, width:3, height:'100%', background:accent, borderRadius:'14px 0 0 14px' }}/>}
      <div style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8, fontWeight:600 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--text2)', marginTop:6 }}>{sub}</div>}
    </div>
  )
}

function CompareBar({ projected, actual, label }) {
  const max = Math.max(projected, actual, 1)
  const projPct = Math.round(projected/max*100)
  const actPct  = Math.round(actual/max*100)
  const diff    = actual - projected
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:13 }}>
        <span style={{ fontWeight:600 }}>{label}</span>
        <span style={{ fontWeight:700, color: diff >= 0 ? 'var(--green)' : 'var(--red)', fontSize:12 }}>
          {diff >= 0 ? '+' : ''}{fmtYen(diff)}
        </span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:11 }}>
          <span style={{ width:70, color:'var(--text2)', textAlign:'right' }}>Projected</span>
          <div style={{ flex:1, height:10, background:'var(--bg3)', borderRadius:5, overflow:'hidden' }}>
            <div style={{ height:'100%', width:projPct+'%', background:'var(--navy)', borderRadius:5, opacity:0.6 }}/>
          </div>
          <span style={{ width:80, fontWeight:600 }}>{fmtYen(projected)}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:11 }}>
          <span style={{ width:70, color:'var(--text2)', textAlign:'right' }}>Actual</span>
          <div style={{ flex:1, height:10, background:'var(--bg3)', borderRadius:5, overflow:'hidden' }}>
            <div style={{ height:'100%', width:actPct+'%', background: diff>=0?'var(--green)':'var(--red)', borderRadius:5 }}/>
          </div>
          <span style={{ width:80, fontWeight:700, color: diff>=0?'var(--green)':'var(--red)' }}>{fmtYen(actual)}</span>
        </div>
      </div>
    </div>
  )
}

export default function RelatorioTab() {
  const [bars,      setBars]      = useState([])
  const [compras,   setCompras]   = useState([])
  const [vendas,    setVendas]    = useState([])
  const [produtos,  setProdutos]  = useState([])
  const [ryoshusho, setRyoshusho] = useState([])
  const [pedidos,   setPedidos]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selMonth,  setSelMonth]  = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [bR, vR, pR, rR, pedR] = await Promise.all([
      supabase.from('bars').select('*'),
      supabase.from('vendas').select('*, vendas_itens(*, produtos(*))'),
      supabase.from('produtos').select('*'),
      supabase.from('ryoshusho').select('*'),
      supabase.from('pedidos').select('*, pedidos_itens(*, produtos(*))'),
    ])
    const cData = await loadAllCompras()
    setBars(bR.data || [])
    setCompras(cData || [])
    setVendas(filterSupplierVendas(vR.data || []))
    setProdutos(pR.data || [])
    setRyoshusho(rR.data || [])
    setPedidos(pedR.data || [])
    const months = [...new Set([
      ...(cData||[]).map(x=>compraMonthKey(x)),
      ...(vR.data||[]).map(x=>monthKey(x.data)),
      ...(pedR.data||[]).map(x=>pedidoMonthKey(x)),
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
    ...compras.map(c=>compraMonthKey(c)),
    ...vendas.map(v=>monthKey(v.data)),
    ...pedidos.map(p=>pedidoMonthKey(p)),
  ])].filter(Boolean).sort().reverse()

  const comprasMes  = compras.filter(c => compraMonthKey(c) === selMonth)
  const vendasMes   = vendas.filter(v => saleMonthKey(v) === selMonth)
  const ryoMes      = ryoshushoForMonth(ryoshusho, selMonth)
  const pedidosMes  = pedidos.filter(p => pedidoMonthKey(p) === selMonth)

  const costIndex = useMemo(
    () => buildPurchaseCostIndex(compras, produtos),
    [compras, produtos]
  )

  const pedidoMap = useMemo(
    () => buildPedidoByVendaPrefix(pedidos.filter(p => p.status === 'entregue')),
    [pedidos]
  )

  const custoCompras  = comprasMes.reduce((a,c)=>a+(+c.total_real||0),0)
  const descontoTotal = comprasMes.reduce((a,c)=>a+(+c.desconto_pontos||0),0)
  const creditoBar    = barCreditsForMonth(selMonth)
  const creditosBar   = barCreditsList(selMonth)

  const mesMargin = marginFromSales(vendasMes, costIndex, produtos, pedidoMap)
  const receitaTotalMes = mesMargin.receita
  const lucroBruto    = receitaTotalMes - custoCompras
  const lucroJbm      = lucroBruto + creditoBar
  const margemBruta   = receitaTotalMes > 0 ? Math.round(lucroBruto / receitaTotalMes * 100) : 0
  const margemJbm     = receitaTotalMes > 0 ? Math.round(lucroJbm / receitaTotalMes * 100) : 0

  // Revenue & profit per bar (custo = compras do mês rateadas pela receita)
  const porBar = bars.map(bar => {
    const vBar     = vendasMes.filter(v=>v.bar_id===bar.id)
    const m        = marginFromSales(vBar, costIndex, produtos, pedidoMap)
    const receita  = m.receita || vBar.reduce((a,v)=>a+(+v.total||0),0)
    const custoV   = allocateInvoiceCost(custoCompras, receita, receitaTotalMes)
    const lucro    = receita - custoV
    const margem   = receita>0 ? Math.round(lucro/receita*100) : 0

    const pedBar      = pedidosMes.filter(p=>p.bar_id===bar.id && p.status==='entregue')
    const projReceita = pedBar.reduce((a,p)=>a+(p.pedidos_itens||[]).reduce((b,it)=>b+(it.preco_unitario*it.qtd),0),0)
    const projCusto   = pedBar.reduce((a,p)=>a+marginFromPedidoItens(p.pedidos_itens, pedidoSaleDate(p), costIndex, produtos).custo,0)
    const projLucro   = projReceita - projCusto

    const creditoBarBar = barCreditsForMonth(selMonth, bar.id)
    const lucroJbmBar   = lucro + creditoBarBar

    // Ryoshusho que cobre este mês (parte proporcional se período multi-mês)
    const ryoBar    = ryoMes.filter(r => r.bar_id === bar.id)
    const ryoTotal  = ryoBar.reduce((a, r) => a + ryoshushoMonthShare(r, selMonth), 0)
    const ryoFull   = ryoBar.reduce((a, r) => a + (+r.total || 0), 0)

    return { bar, receita, custoV, lucro, margem, qtdVendas:vBar.length,
             projReceita, projLucro, ryoTotal, ryoFull, ryoBar, creditoBarBar, lucroJbmBar }
  })

  const receitaTotal  = porBar.reduce((a,r)=>a+r.receita,0)
  const lucroTotal    = porBar.reduce((a,r)=>a+r.lucro,0)
  const lucroJbmTotal = lucroTotal + creditoBar
  const projTotal     = porBar.reduce((a,r)=>a+r.projReceita,0)
  const projLucroTot  = porBar.reduce((a,r)=>a+r.projLucro,0)
  const ryoTotal      = porBar.reduce((a,r)=>a+r.ryoTotal,0)
  const margemGeral   = receitaTotal>0 ? Math.round(lucroTotal/receitaTotal*100) : 0
  const margemJbmGeral = receitaTotal>0 ? Math.round(lucroJbmTotal/receitaTotal*100) : 0

  const porProdutoComprado = aggregateComprasItens(comprasMes)

  const vendasDetalhe = vendasMes
    .map(v => {
      const bar = bars.find(b => b.id === v.bar_id)
      const receita = +v.total || marginFromSales([v], costIndex, produtos, pedidoMap).receita
      return {
        id: v.id,
        data: v.data,
        barNome: bar?.nome || '—',
        barCor: bar?.cor,
        receita,
        obs: v.obs,
      }
    })
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))

  if (loading) return <Spinner text="Loading report..." />

  return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
        <span style={{ fontSize:14, fontWeight:600 }}>Month:</span>
        <select value={selMonth} onChange={e=>setSelMonth(e.target.value)} style={{ width:'auto' }}>
          {allMonths.length===0 && <option>No data yet</option>}
          {allMonths.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:18 }}>
        <MetricCard label="Compras pagas no mês" value={fmtYen(custoCompras)} color="var(--red)" accent="var(--red)"
          sub={`${comprasMes.length} nota(s) · valores das notas cadastradas`} />
        <MetricCard label="Receita" value={fmtYen(receitaTotal)} color="var(--navy)" accent="var(--navy)"
          sub={`${vendasMes.length} venda(s) registradas`} />
        <MetricCard label="Lucro bruto" value={fmtYen(lucroTotal)} color="var(--green)" accent="var(--green)"
          sub={`margem ${margemGeral}% · receita − compras do mês`} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle>Resumo financeiro — {monthLabel(selMonth)}</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div style={{ padding: '14px 16px', background: 'var(--bg3)', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Receita</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)' }}>{fmtYen(receitaTotal)}</div>
          </div>
          <div style={{ padding: '14px 16px', background: 'var(--bg3)', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Compras (notas)</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red)' }}>{fmtYen(custoCompras)}</div>
          </div>
          <div style={{ padding: '14px 16px', background: 'var(--bg3)', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Lucro bruto</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{fmtYen(lucroTotal)}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>margem {margemGeral}%</div>
          </div>
        </div>
        {creditoBar > 0 && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(26,107,74,0.08)', fontSize: 12, color: 'var(--text2)' }}>
            Lucro JBM (c/ crédito bar LM): <strong style={{ color: 'var(--green)' }}>{fmtYen(lucroJbmTotal)}</strong>
            {' '}(+{fmtYen(creditoBar)} pago pelo bar)
          </div>
        )}
      </div>

      <ComprasNotasSection
        comprasMes={comprasMes}
        totalCompras={custoCompras}
        creditoBar={creditoBar}
        creditosBar={creditosBar}
      />

      {(creditoBar > 0 || descontoTotal > 0) && (
        <div style={{ display:'grid', gridTemplateColumns: creditoBar > 0 ? '1fr 1fr' : '1fr', gap:12, marginBottom:18 }}>
          {creditoBar > 0 && (
            <MetricCard label="Lucro JBM (c/ crédito bar)" value={fmtYen(lucroJbmTotal)} color="var(--green)" accent="var(--green)"
              sub={`+${fmtYen(creditoBar)} pago pelo bar · margem ${margemJbmGeral}%`} />
          )}
          {descontoTotal > 0 && (
            <MetricCard label="Pontos economizados" value={fmtYen(descontoTotal)} color="var(--gold)" accent="var(--gold)"
              sub="desconto em compras do mês" />
          )}
        </div>
      )}

      {/* Projected vs Actual */}
      <div className="card" style={{ marginBottom:16 }}>
        <SectionTitle>Projected vs Actual Revenue</SectionTitle>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:20 }}>
          <div style={{ textAlign:'center', padding:'14px', background:'var(--bg3)', borderRadius:10 }}>
            <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Projected Revenue</div>
            <div style={{ fontSize:20, fontWeight:800, color:'var(--navy)' }}>{fmtYen(projTotal)}</div>
            <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>from delivered orders</div>
          </div>
          <div style={{ textAlign:'center', padding:'14px', background:'var(--bg3)', borderRadius:10 }}>
            <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Actual Revenue</div>
            <div style={{ fontSize:20, fontWeight:800, color: receitaTotal>=projTotal?'var(--green)':'var(--red)' }}>{fmtYen(receitaTotal)}</div>
            <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>recorded sales</div>
          </div>
          <div style={{ textAlign:'center', padding:'14px', background:'var(--bg3)', borderRadius:10 }}>
            <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Difference</div>
            <div style={{ fontSize:20, fontWeight:800, color: (receitaTotal-projTotal)>=0?'var(--green)':'var(--red)' }}>
              {receitaTotal-projTotal>=0?'+':''}{fmtYen(receitaTotal-projTotal)}
            </div>
            <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>vs projected</div>
          </div>
        </div>
        {porBar.filter(r=>r.projReceita>0||r.receita>0).map(r=>(
          <CompareBar key={r.bar.id} label={r.bar.nome}
            projected={r.projReceita} actual={r.receita} />
        ))}
        {porBar.every(r=>r.projReceita===0&&r.receita===0) && (
          <Empty text="No data for this month" />
        )}
      </div>

      {/* Ryoshusho — período coberto */}
      <div className="card" style={{ marginBottom:16 }}>
        <SectionTitle>領収書 (Receipts) — {monthLabel(selMonth)}</SectionTitle>
        {ryoMes.length === 0 ? (
          <Empty text="Nenhum 領収書 cobre este mês" />
        ) : (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div style={{ padding:'16px', background:'var(--bg3)', borderRadius:10 }}>
                <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Parte deste mês</div>
                <div style={{ fontSize:22, fontWeight:800, color:'var(--gold)' }}>{fmtYen(ryoTotal)}</div>
                <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>proporcional ao período · incl. 10% tax</div>
              </div>
              <div style={{ padding:'16px', background:'var(--bg3)', borderRadius:10 }}>
                <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Receita registrada</div>
                <div style={{ fontSize:22, fontWeight:800, color:'var(--navy)' }}>{fmtYen(receitaTotal)}</div>
                <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>{vendasMes.length} vendas no mês</div>
              </div>
            </div>
            {ryoMes.map(r => {
              const share = ryoshushoMonthShare(r, selMonth)
              const bar = bars.find(b => b.id === r.bar_id)
              const multiMonth = r.periodo_inicio && r.periodo_fim && monthKey(r.periodo_inicio) !== monthKey(r.periodo_fim)
              return (
                <div key={r.id} style={{ padding:'12px 14px', borderRadius:10, border:'1px solid var(--border)', marginBottom:8, fontSize:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, marginBottom:4 }}>
                    <span>{bar?.nome || '—'} · {r.numero || '—'}</span>
                    <span style={{ color:'var(--gold)' }}>{fmtYen(share)}{multiMonth ? ` / ${fmtYen(r.total)}` : ''}</span>
                  </div>
                  <div style={{ color:'var(--text2)' }}>
                    Período: {fmtDate(r.periodo_inicio)} – {fmtDate(r.periodo_fim)}
                    {multiMonth && ' · cobre vários meses — valor proporcional mostrado'}
                  </div>
                </div>
              )
            })}
            <div style={{ marginTop:12, padding:'12px 16px', borderRadius:10, background:'var(--bg3)', fontSize:12, color:'var(--text2)', lineHeight:1.6 }}>
              ℹ️ 領収書 cobre o <strong>período emitido</strong> (pode incluir jun+juL). A receita acima é só de <strong>{monthLabel(selMonth)}</strong>.
              Compare com a fatura JBM, não com o lucro.
            </div>
          </>
        )}
      </div>

      {/* Per bar */}
      <div className="card" style={{ marginBottom:16 }}>
        <SectionTitle>Revenue by Bar</SectionTitle>
        {porBar.length===0 ? <Empty text="No bars registered" /> : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat('+Math.min(bars.length,3)+',1fr)', gap:14 }}>
            {porBar.map(r=>(
              <div key={r.bar.id} style={{
                border:'1.5px solid '+r.bar.cor+'44', borderRadius:14,
                padding:'18px 20px', background:r.bar.cor+'0a'
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:r.bar.cor }}>{r.bar.nome}</div>
                  <div style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:6,
                    background:r.bar.cor+'22', color:r.bar.cor }}>{r.qtdVendas} sales</div>
                </div>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:2 }}>Revenue</div>
                <div style={{ fontSize:22, fontWeight:700, marginBottom:12 }}>{fmtYen(r.receita)}</div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6 }}>
                  <span style={{ color:'var(--text2)' }}>Compras do mês</span>
                  <span style={{ color:'var(--red)' }}>{fmtYen(r.custoV)}</span>
                </div>
                {r.creditoBarBar > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6 }}>
                    <span style={{ color:'var(--text2)' }}>Crédito bar (LM)</span>
                    <span style={{ color:'var(--green)' }}>+{fmtYen(r.creditoBarBar)}</span>
                  </div>
                )}
                {r.ryoTotal > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6 }}>
                    <span style={{ color:'var(--text2)' }}>領収書 (parte do mês)</span>
                    <span style={{ color:'var(--gold)' }}>{fmtYen(r.ryoTotal)}</span>
                  </div>
                )}
                <div style={{ borderTop:'0.5px solid '+r.bar.cor+'33', paddingTop:10, marginTop:4 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700 }}>
                    <span>Lucro bruto</span>
                    <span style={{ color:r.lucro>=0?'var(--green)':'var(--red)' }}>{fmtYen(r.lucro)}</span>
                  </div>
                  {r.creditoBarBar > 0 && (
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:700, marginTop:6 }}>
                      <span>Lucro JBM</span>
                      <span style={{ color:'var(--green)' }}>{fmtYen(r.lucroJbmBar)}</span>
                    </div>
                  )}
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:4 }}>
                    Margin {r.margem}%
                    <div style={{ height:4, borderRadius:2, background:'var(--border)', marginTop:4, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:Math.min(r.margem,100)+'%', borderRadius:2,
                        background:r.margem>50?'var(--green)':r.margem>30?'var(--amber)':'var(--red)'
                      }}/>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vendas do mês */}
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
                <td colSpan={3} style={{ fontWeight: 700 }}>Total ({vendasDetalhe.length} entrega{vendasDetalhe.length === 1 ? '' : 's'})</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--navy)' }}>{fmtYen(receitaTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Resumo por produto nas notas */}
      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle>Itens comprados — resumo por produto</SectionTitle>
        {porProdutoComprado.length === 0 ? <Empty text="Nenhum item nas notas deste mês" /> : (
          <table>
            <thead>
              <tr><th>Produto</th><th style={{ textAlign: 'right' }}>Qtd</th><th style={{ textAlign: 'right' }}>Custo total</th><th style={{ textAlign: 'right' }}>Custo médio</th></tr>
            </thead>
            <tbody>
              {porProdutoComprado.map(p => (
                <tr key={p.nome}>
                  <td style={{ fontWeight: 500 }}>{p.nome}</td>
                  <td style={{ textAlign: 'right' }}>{p.qtd}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{fmtYen(p.custoTotal)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{p.qtd ? fmtYen(Math.round(p.custoTotal / p.qtd)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
