import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { holdingSb } from '../lib/supabase'
import { fmtYen } from '../lib/format'
import { PageHeader, StatGrid, StatusBadge, Empty, Btn, Field, inputStyle, Modal } from '../lib/sharedUi'

export default function Logistica() {
  const [rows, setRows] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})

  useEffect(() => { load(); const iv = setInterval(load, 30_000); return () => clearInterval(iv) }, [])

  async function load() {
    const { data } = await holdingSb.from('logistics_jobs').select('*').order('job_date', { ascending: false })
    setRows(data || [])
  }

  const commPending = rows.filter(r => r.commission_status === 'pendente').reduce((a, r) => a + Number(r.commission || 0), 0)
  const revenue = rows.filter(r => r.status !== 'cancelado').reduce((a, r) => a + Number(r.revenue || 0), 0)
  const profit = rows.reduce((a, r) => a + Number(r.revenue || 0) - Number(r.cost || 0), 0)

  function openNew() {
    setForm({
      reference: '', client_name: '', route_description: '', job_date: new Date().toISOString().slice(0, 10),
      revenue: '', cost: '', commission: '', commission_status: 'pendente', status: 'ativo', notes: '',
    })
    setModal(true)
  }

  async function save() {
    try {
      const { error } = await holdingSb.from('logistics_jobs').insert({
        ...form,
        revenue: Number(form.revenue) || 0,
        cost: Number(form.cost) || 0,
        commission: Number(form.commission) || 0,
      })
      if (error) throw error
      toast.success('Trabalho registrado')
      setModal(false)
      load()
    } catch (e) {
      toast.error(e.message?.includes('does not exist') ? 'Rode JBM_HOLDING_MODULES_SQL.sql no Supabase' : e.message)
    }
  }

  async function markCommPaid(id) {
    await holdingSb.from('logistics_jobs').update({ commission_status: 'pago' }).eq('id', id)
    toast.success('Comissão paga')
    load()
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div>
      <PageHeader icon="🚚" title="JBM Logística" color="#a78bfa">
        <Btn onClick={openNew}>+ Novo trabalho</Btn>
      </PageHeader>

      <StatGrid items={[
        ['Trabalhos', rows.length, '#60a5fa'],
        ['Receita total', revenue, '#4ade80', 'yen'],
        ['Lucro bruto', profit, '#c19c56', 'yen'],
        ['Comissões pendentes', commPending, '#fbbf24', 'yen'],
      ]} />

      {rows.length === 0 ? <Empty text="Nenhum trabalho de logística" /> :
        rows.map(r => (
          <div key={r.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.client_name} {r.reference && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>#{r.reference}</span>}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r.route_description || '—'}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{r.job_date}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <StatusBadge status={r.status} />
                <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80', marginTop: 6 }}>{fmtYen(r.revenue)}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>custo {fmtYen(r.cost)} · lucro {fmtYen(Number(r.revenue) - Number(r.cost))}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 12 }}>Comissão: <strong style={{ color: '#fbbf24' }}>{fmtYen(r.commission)}</strong> <StatusBadge status={r.commission_status} /></div>
              {r.commission_status === 'pendente' && <Btn variant="ghost" onClick={() => markCommPaid(r.id)}>Pagar comissão</Btn>}
            </div>
          </div>
        ))}

      <Modal open={modal} title="Novo trabalho logística" onClose={() => setModal(false)}>
        <Field label="Cliente"><input style={inputStyle} value={form.client_name} onChange={e => set('client_name', e.target.value)} /></Field>
        <Field label="Referência"><input style={inputStyle} value={form.reference} onChange={e => set('reference', e.target.value)} /></Field>
        <Field label="Rota / descrição"><input style={inputStyle} value={form.route_description} onChange={e => set('route_description', e.target.value)} /></Field>
        <Field label="Data"><input type="date" style={inputStyle} value={form.job_date} onChange={e => set('job_date', e.target.value)} /></Field>
        <Field label="Receita (¥)"><input type="number" style={inputStyle} value={form.revenue} onChange={e => set('revenue', e.target.value)} /></Field>
        <Field label="Custo (¥)"><input type="number" style={inputStyle} value={form.cost} onChange={e => set('cost', e.target.value)} /></Field>
        <Field label="Comissão (¥)"><input type="number" style={inputStyle} value={form.commission} onChange={e => set('commission', e.target.value)} /></Field>
        <Field label="Notas"><input style={inputStyle} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
        <Btn onClick={save}>Salvar</Btn>
      </Modal>
    </div>
  )
}
