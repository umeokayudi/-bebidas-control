import { useState, useEffect } from 'react'
import { holdingSb } from '../lib/supabase'
import { fetchHoldingSnapshot } from '../lib/cashflowSync'
import { fmtYen } from '../lib/format'
import CashflowPanel, { KuriPuroFinancePanel } from '../components/CashflowPanel'

export default function Financeiro() {
  const [entries, setEntries] = useState([])
  const [snap, setSnap] = useState(null)

  useEffect(() => {
    load()
    const iv = setInterval(load, 30_000)
    return () => clearInterval(iv)
  }, [])

  async function load() {
    setSnap(await fetchHoldingSnapshot(holdingSb))
    const { data } = await holdingSb.from('salary_payments').select('*').order('payment_date', { ascending: false }).limit(50)
    setEntries(data || [])
  }

  const d = snap?.drinks || {}
  const k = snap?.kuripuro || {}
  const kuriEntries = entries
  const holdingEntries = snap?.kuripuro?.lancamentos || []

  const sum = (list, type) => list.filter(e => (e.type || 'expense') === type).reduce((a, e) => a + Number(e.amount || 0), 0)

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#fbbf24', marginBottom: 20 }}>💴 Financeiro — Holding</div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <CashflowPanel cf={d} title="🍾 JBM Drinks" color="#4ade80" />
        <KuriPuroFinancePanel kp={k} />
      </div>

      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[
          ['Drinks a receber', d.aReceber, '#4ade80'],
          ['Kuri lucro/mês', k.lucroMes, '#60a5fa'],
          ['Holding despesas', sum(holdingEntries, 'expense'), '#f87171'],
          ['Holding receitas', sum(holdingEntries, 'income'), '#c19c56'],
        ].map(([l, v, c]) => (
          <div key={l} className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: c }}>{fmtYen(v)}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🧹 KuriPuro — pagamentos folha</div>
        {kuriEntries.length === 0 && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Nenhum</div>}
        {kuriEntries.slice(0, 12).map(e => (
          <PaymentRow key={e.id} e={e} />
        ))}
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🏛 Snapshot — lançamentos recentes</div>
        {holdingEntries.length === 0 && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Nenhum</div>}
        {holdingEntries.slice(0, 15).map((e, i) => (
          <EntryRow key={i} e={e} />
        ))}
      </div>
    </div>
  )
}

function PaymentRow({ e }) {
  const isIncome = e.is_deduction
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <div style={{ fontSize: 12 }}>{e.employee_name} — {e.description || e.payment_type}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{e.payment_date} · {e.status} · {e.payment_type}</div>
      </div>
      <div style={{ fontWeight: 600, color: isIncome ? '#4ade80' : '#f87171' }}>
        {isIncome ? '+' : '-'}{fmtYen(e.amount)}
      </div>
    </div>
  )
}

function EntryRow({ e }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <div style={{ fontSize: 12 }}>{e.description}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{e.date} · {e.category}</div>
      </div>
      <div style={{ fontWeight: 600, color: e.type === 'income' ? '#4ade80' : '#f87171' }}>
        {e.type === 'income' ? '+' : '-'}{fmtYen(e.amount)}
      </div>
    </div>
  )
}
