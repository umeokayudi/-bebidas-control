import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { fmtYen, monthKey, monthLabel, fmtDate, Spinner, Empty, SectionTitle, filterSupplierVendas, saleMonthKey, compraMonthKey } from './utils'
import { buildPurchaseCostIndex, buildPedidoByVendaPrefix, marginFromSales, marginFromPedidoItens, allocateInvoiceCost } from '../lib/marginCost'
import { pedidoSaleDate } from '../lib/pedidoVenda'
import { barCreditsForMonth, barCreditsList } from '../lib/barCredits'
import { ryoshushoForMonth, ryoshushoMonthShare } from '../lib/reportPeriod'
import { loadAllCompras } from '../lib/loadCompras'
import ComprasDetailModal from './ComprasDetailModal'

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
  const [comprasModal, setComprasModal] = useState(false)

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
    if (months[0]) setSelMonth(months[0])
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

  const porProduto = (() => {
    const prodMap = {}
    vendasMes.forEach(v => (v.vendas_itens || []).forEach(it => {
      const pid = it.produto_id
      const receita = (+it.preco_unitario || 0) * (+it.qtd || 0)
      if (!prodMap[pid]) {
        const p = produtos.find(x => x.id === pid) || {}
        prodMap[pid] = { ...p, nome: it.produtos?.nome || p.nome || '?', vendido: 0, receita: 0, custo: 0, lucro: 0 }
      }
      prodMap[pid].vendido += it.qtd
      prodMap[pid].receita += receita
    }))
    Object.values(prodMap).forEach(p => {
      p.custo = allocateInvoiceCost(custoCompras, p.receita, receitaTotalMes)
      p.lucro = p.receita - p.custo
    })
    return Object.values(prodMap).filter(p => p.vendido > 0).sort((a, b) => b.lucro - a.lucro)
  })()

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
        <div onClick={() => setComprasModal(true)} style={{ cursor:'pointer' }}>
          <MetricCard label="Compras pagas no mês" value={fmtYen(custoCompras)} color="var(--red)" accent="var(--red)"
            sub={`${comprasMes.length} nota(s) · clique para detalhes`} />
        </div>
        <MetricCard label="Receita" value={fmtYen(receitaTotal)} color="var(--navy)" accent="var(--navy)" />
        <MetricCard label="Lucro bruto" value={fmtYen(lucroTotal)} color="var(--green)" accent="var(--green)"
          sub={`margem ${margemGeral}% · receita − compras do mês`} />
      </div>

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

      {/* Per product */}
      <div className="card" style={{ marginBottom:16 }}>
        <SectionTitle>Product Performance</SectionTitle>
        {porProduto.length===0 ? <Empty text="No sales this month" /> : (
          <table>
            <thead>
              <tr><th>Product</th><th>Qty</th><th>Cost</th><th>Revenue</th><th>Profit</th><th>Margin</th></tr>
            </thead>
            <tbody>
              {porProduto.map(p=>{
                const m = p.receita>0 ? Math.round(p.lucro/p.receita*100) : 0
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight:500 }}>{p.nome}</td>
                    <td>{p.vendido}</td>
                    <td style={{ color:'var(--red)' }}>{fmtYen(p.custo)}</td>
                    <td>{fmtYen(p.receita)}</td>
                    <td style={{ fontWeight:700, color:'var(--green)' }}>{fmtYen(p.lucro)}</td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ height:6, width:80, borderRadius:3, background:'var(--border)', overflow:'hidden' }}>
                          <div style={{ height:'100%', width:Math.min(m,100)+'%', borderRadius:3,
                            background:m>50?'var(--green)':m>30?'var(--amber)':'var(--red)'
                          }}/>
                        </div>
                        <span style={{ fontSize:12, fontWeight:600 }}>{m}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Purchases */}
      <div className="card">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <SectionTitle>Compras do mês</SectionTitle>
          {comprasMes.length > 0 && (
            <button onClick={() => setComprasModal(true)} className="btn-primary" style={{ padding:'8px 14px', fontSize:12, borderRadius:10 }}>
              Ver detalhes
            </button>
          )}
        </div>
        {creditoBar > 0 && (
          <div style={{ marginBottom:14, padding:'10px 14px', borderRadius:10, background:'rgba(26,107,74,0.08)', fontSize:12, color:'var(--text2)' }}>
            Créditos pagos pelo bar: {creditosBar.map(c => `${c.fornecedor} ${fmtYen(c.valor)}`).join(' · ')}
          </div>
        )}
        {comprasMes.length===0 ? <Empty text="No purchases this month" /> : (
          <table>
            <thead><tr><th>Date</th><th>Supplier</th><th>Payment</th><th>Subtotal</th><th>Points disc.</th><th>Real cost</th></tr></thead>
            <tbody>
              {comprasMes.map(c=>(
                <tr key={c.id}>
                  <td>{c.data}</td>
                  <td>{c.fornecedor}</td>
                  <td>{c.pagamento}</td>
                  <td>{fmtYen(c.subtotal)}</td>
                  <td style={{ color:'var(--green)' }}>{+c.desconto_pontos>0?'-'+fmtYen(c.desconto_pontos):'—'}</td>
                  <td style={{ fontWeight:700 }}>{fmtYen(c.total_real)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ComprasDetailModal
        open={comprasModal}
        onClose={() => setComprasModal(false)}
        compras={comprasMes}
        monthLabel={monthLabel(selMonth)}
        creditoBar={creditoBar}
      />
    </div>
  )
}
