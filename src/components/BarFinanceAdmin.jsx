import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { HOLDING_DRINKS } from '../lib/holdingLinks'
import { filterSupplierVendas, fmtYen, fmtDate } from './utils'

const ATOMIC_BAR_ID = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'
const PORTAL_URL = typeof window !== 'undefined' ? window.location.origin : 'https://bebidas-control.vercel.app'

export default function BarFinanceAdmin() {
  const [bars, setBars] = useState([])
  const [barId, setBarId] = useState(ATOMIC_BAR_ID)
  const [faturas, setFaturas] = useState([])
  const [vendas, setVendas] = useState([])
  const [pricing, setPricing] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [clientEmail, setClientEmail] = useState('')

  useEffect(() => { loadBars() }, [])
  useEffect(() => { if (barId) loadBar(barId) }, [barId])

  async function loadBars() {
    const { data } = await supabase.from('bars').select('id,nome').order('nome')
    setBars(data || [])
    const atomic = (data || []).find(b => /atomic/i.test(b.nome))
    if (atomic) setBarId(atomic.id)
  }

  async function loadBar(id) {
    const [fR, vR, pR, pedR, perfR] = await Promise.all([
      supabase.from('faturas').select('*').eq('bar_id', id).order('data_vencimento', { ascending: false }),
      supabase.from('vendas').select('*, vendas_itens(*, produtos(nome))').eq('bar_id', id).order('data', { ascending: false }).limit(30),
      supabase.from('bar_pricing').select('*, produtos(nome)').eq('bar_id', id),
      supabase.from('pedidos').select('*').eq('bar_id', id).order('data_pedido', { ascending: false }).limit(15),
      supabase.from('perfis').select('email,nome').eq('bar_id', id).eq('role', 'cliente').limit(1),
    ])
    setFaturas(fR.data || [])
    setVendas(filterSupplierVendas(vR.data || []))
    setPricing(pR.data || [])
    setPedidos(pedR.data || [])
    setClientEmail(perfR.data?.[0]?.email || '')
  }

  const bar = bars.find(b => b.id === barId)
  const aReceber = faturas.filter(f => f.status !== 'pago').reduce((a, f) => a + Math.max(0, (+f.valor || +f.total || 0) - (+f.pago || 0)), 0)
  const pricingOk = pricing.filter(p => p.preco_drink > 0 && p.drinks_por_garrafa > 0).length
  const pricingMissing = pricing.filter(p => !p.preco_drink || !p.drinks_por_garrafa).length

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)' }}>🏛 Painel Financeiro — Bar</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Admin JBM · sincronizado com portal do cliente</div>
        </div>
        <select className="input" value={barId} onChange={e => setBarId(e.target.value)} style={{ minWidth: 180 }}>
          {bars.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
        {[['A receber', fmtYen(aReceber), 'var(--green)'], ['Faturas', faturas.length, 'var(--gold)'], ['Entregas', vendas.length, 'var(--blue)'], ['Preços POS', `${pricingOk} OK`, pricingMissing ? 'var(--red)' : 'var(--green)'], ['Pedidos', pedidos.filter(p => p.status === 'pendente').length, 'var(--amber)']].map(([l, v, c]) => (
          <div key={l} className="card" style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {pricingMissing > 0 && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--amber-bg)', color: 'var(--amber)', fontSize: 13, marginBottom: 16 }}>
          ⚠️ {pricingMissing} produto(s) sem preço POS configurado — corrija na aba Pricing do portal do cliente.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>💰 Faturas — {bar?.nome}</div>
          {faturas.length === 0 && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Nenhuma</div>}
          {faturas.map(f => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 12 }}>{f.obs || f.periodo_inicio?.slice(0, 7) || '—'}</div>
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>venc. {fmtDate(f.data_vencimento)} · {f.status}</div>
              </div>
              <div style={{ fontWeight: 700, color: f.status === 'pago' ? 'var(--green)' : 'var(--amber)' }}>{fmtYen(f.valor || f.total)}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>📦 Pedidos recentes</div>
          {pedidos.slice(0, 8).map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
              <span>{p.data_pedido} · {p.status}</span>
              <span style={{ fontWeight: 600 }}>{fmtYen(p.total_estimado)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>🔗 Portal do cliente (estoque + preços POS)</div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
          O cliente <strong>{bar?.nome}</strong> acessa o portal externo para ver entregas, estoque, faturas e configurar preços de drinks.
          {clientEmail && <> Login: <code>{clientEmail}</code></>}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href={PORTAL_URL} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ textDecoration: 'none', fontSize: 13 }}>
            Abrir portal (como admin preview)
          </a>
          <a href={HOLDING_DRINKS} target="_blank" rel="noreferrer" className="btn" style={{ textDecoration: 'none', fontSize: 13, background: 'var(--navy2)', color: 'var(--gold)' }}>
            ↗ JBM Holding — Drinks
          </a>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>🍾 Últimas entregas fornecedor</div>
        {vendas.slice(0, 10).map(v => (
          <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
            <span>{fmtDate(v.data)} · {(v.vendas_itens || []).length} itens</span>
            <span style={{ fontWeight: 600 }}>{fmtYen(v.total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
