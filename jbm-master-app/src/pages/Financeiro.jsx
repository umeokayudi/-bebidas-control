import { useState, useEffect } from 'react'
import { holdingSb } from '../lib/supabase'
import { fetchDrinksCashflow } from '../lib/cashflowSync'
import { fmtYen } from '../lib/format'
import CashflowPanel from '../components/CashflowPanel'

export default function Financeiro() {
  const [entries, setEntries] = useState([])
  const [cf, setCf] = useState(null)

  useEffect(() => {
    load()
    const iv = setInterval(load, 30_000)
    return () => clearInterval(iv)
  }, [])

  async function load() {
    setCf(await fetchDrinksCashflow(holdingSb))
    const { data } = await holdingSb.from('financial_entries').select('*').order('date', { ascending: false }).limit(50)
    setEntries(data || [])
  }

  const expenses = entries.filter(e => e.type === 'expense').reduce((a, e) => a + Number(e.amount || 0), 0)
  const income = entries.filter(e => e.type === 'income').reduce((a, e) => a + Number(e.amount || 0), 0)

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#fbbf24', marginBottom: 20 }}>💴 Financeiro</div>
      <CashflowPanel cf={cf} title="💸 Cashflow JBM Drinks (bebidas-control)" />
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[['Despesas', expenses, '#f87171'], ['Receitas', income, '#4ade80'], ['Saldo', income - expenses, income >= expenses ? '#4ade80' : '#f87171'], ['A receber Drinks', cf?.aReceber ?? 0, '#c19c56']].map(([l, v, c]) => (
          <div key={l} className="card" style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: c }}>{fmtYen(v)}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{l}</div></div>
        ))}
      </div>
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Lançamentos recentes</div>
        {entries.length === 0 && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Nenhum lançamento</div>}
        {entries.slice(0, 15).map(e => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div><div style={{ fontSize: 12 }}>{e.description}</div><div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{e.unit} · {e.date}</div></div>
            <div style={{ fontWeight: 600, color: e.type === 'income' ? '#4ade80' : '#f87171' }}>{e.type === 'income' ? '+' : '-'}{fmtYen(e.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
