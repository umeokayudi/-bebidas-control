import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { fmtYen } from '../lib/format'
import {
  loadPresentations, loadPlacements, loadCommissions,
  savePresentation, savePlacement, saveCommission, markCommissionPaid,
} from '../lib/holdingStorage'
import { PageHeader, StatGrid, TabBar, StatusBadge, Empty, Btn, Field, inputStyle, Modal } from '../lib/sharedUi'

const TABS = [
  { id: 'apresentacoes', label: 'Apresentações' },
  { id: 'placements', label: 'Colocações' },
  { id: 'comissoes', label: 'Comissões' },
]

const COMM_TYPES = [
  { value: 'apresentacao', label: 'Apresentação' },
  { value: 'colocacao', label: 'Colocação' },
  { value: 'empreiteira', label: 'Empreiteira' },
  { value: 'bonus', label: 'Bônus' },
]

export default function HR() {
  const [tab, setTab] = useState('apresentacoes')
  const [presentations, setPresentations] = useState([])
  const [placements, setPlacements] = useState([])
  const [commissions, setCommissions] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})

  useEffect(() => { load(); const iv = setInterval(load, 30_000); return () => clearInterval(iv) }, [])

  async function load() {
    const [p, pl, c] = await Promise.all([loadPresentations(), loadPlacements(), loadCommissions()])
    setPresentations(p)
    setPlacements(pl)
    setCommissions(c)
  }

  const commPending = commissions.filter(c => c.status === 'pendente' || c.status === 'parcial')
    .reduce((a, c) => a + Number(c.amount || 0), 0)
  const activeFees = placements.filter(p => p.status === 'active').reduce((a, p) => a + Number(p.fee || 0), 0)

  function openNew(type) {
    const today = new Date().toISOString().slice(0, 10)
    if (type === 'apresentacao') setForm({ candidate_name: '', client_company: '', position: '', presentation_date: today, status: 'agendada', expected_fee: '', notes: '' })
    if (type === 'placement') setForm({ candidate_name: '', client_company: '', position: '', placement_date: today, fee: '', daily_rate: '', work_days_per_month: 22, status: 'active', notes: '' })
    if (type === 'comissao') setForm({ type: 'colocacao', candidate_name: '', client_company: '', amount: '', due_date: today, status: 'pendente', notes: '' })
    setModal(type)
  }

  async function save() {
    try {
      if (modal === 'apresentacao') await savePresentation(form)
      if (modal === 'placement') await savePlacement(form)
      if (modal === 'comissao') await saveCommission(form)
      toast.success('Salvo!')
      setModal(null)
      load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function onMarkPaid(id) {
    await markCommissionPaid(id)
    toast.success('Comissão paga')
    load()
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div>
      <PageHeader icon="👥" title="JBM HR — Recrutamento & Empreiteira" color="#c19c56">
        <Btn onClick={() => openNew(tab === 'comissoes' ? 'comissao' : tab === 'placements' ? 'placement' : 'apresentacao')}>+ Novo</Btn>
      </PageHeader>

      <StatGrid items={[
        ['Apresentações', presentations.length, '#60a5fa'],
        ['Colocações ativas', placements.filter(p => p.status === 'active').length, '#4ade80'],
        ['Comissões a receber', commPending, '#fbbf24', 'yen'],
        ['Fees placements', activeFees, '#c19c56', 'yen'],
      ]} />

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'apresentacoes' && (
        presentations.length === 0 ? <Empty text="Nenhuma apresentação — clique + Novo" /> :
        presentations.map(r => (
          <div key={r.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.candidate_name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r.position} → {r.client_company}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{r.presentation_date} · esperado {fmtYen(r.expected_fee)}</div>
              </div>
              <StatusBadge status={r.status} />
            </div>
          </div>
        ))
      )}

      {tab === 'placements' && (
        placements.length === 0 ? <Empty text="Nenhuma colocação — apresente candidatos às empresas" /> :
        placements.map(r => (
          <div key={r.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.candidate_name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r.position} @ {r.client_company}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                  desde {r.placement_date} · fee {fmtYen(r.fee)}
                  {r.daily_rate ? ` · ¥${r.daily_rate}/dia × ${r.work_days_per_month}d` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <StatusBadge status={r.status} />
                <div style={{ fontSize: 16, fontWeight: 700, color: '#c19c56', marginTop: 6 }}>{fmtYen(r.fee)}</div>
              </div>
            </div>
          </div>
        ))
      )}

      {tab === 'comissoes' && (
        commissions.length === 0 ? <Empty text="Nenhuma comissão registrada" /> :
        commissions.map(r => (
          <div key={r.id} className="card" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{r.candidate_name} <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>({r.type})</span></div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r.client_company} · venc. {r.due_date || '—'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: r.status === 'pago' ? '#4ade80' : '#fbbf24' }}>{fmtYen(r.amount)}</div>
              <StatusBadge status={r.status} />
              {r.status === 'pendente' && <Btn variant="ghost" onClick={() => onMarkPaid(r.id)}>Marcar pago</Btn>}
            </div>
          </div>
        ))
      )}

      <Modal open={!!modal} title={modal === 'apresentacao' ? 'Nova apresentação' : modal === 'placement' ? 'Nova colocação' : 'Nova comissão'} onClose={() => setModal(null)}>
        {modal === 'apresentacao' && (<>
          <Field label="Candidato"><input style={inputStyle} value={form.candidate_name} onChange={e => set('candidate_name', e.target.value)} /></Field>
          <Field label="Empresa cliente"><input style={inputStyle} value={form.client_company} onChange={e => set('client_company', e.target.value)} /></Field>
          <Field label="Cargo"><input style={inputStyle} value={form.position} onChange={e => set('position', e.target.value)} /></Field>
          <Field label="Data"><input type="date" style={inputStyle} value={form.presentation_date} onChange={e => set('presentation_date', e.target.value)} /></Field>
          <Field label="Fee esperado (¥)"><input type="number" style={inputStyle} value={form.expected_fee} onChange={e => set('expected_fee', e.target.value)} /></Field>
          <Field label="Notas"><input style={inputStyle} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
        </>)}
        {modal === 'placement' && (<>
          <Field label="Candidato"><input style={inputStyle} value={form.candidate_name} onChange={e => set('candidate_name', e.target.value)} /></Field>
          <Field label="Empresa"><input style={inputStyle} value={form.client_company} onChange={e => set('client_company', e.target.value)} /></Field>
          <Field label="Cargo"><input style={inputStyle} value={form.position} onChange={e => set('position', e.target.value)} /></Field>
          <Field label="Início"><input type="date" style={inputStyle} value={form.placement_date} onChange={e => set('placement_date', e.target.value)} /></Field>
          <Field label="Fee mensal (¥)"><input type="number" style={inputStyle} value={form.fee} onChange={e => set('fee', e.target.value)} /></Field>
          <Field label="Diária (¥)"><input type="number" style={inputStyle} value={form.daily_rate} onChange={e => set('daily_rate', e.target.value)} /></Field>
        </>)}
        {modal === 'comissao' && (<>
          <Field label="Tipo"><select style={inputStyle} value={form.type} onChange={e => set('type', e.target.value)}>{COMM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
          <Field label="Candidato"><input style={inputStyle} value={form.candidate_name} onChange={e => set('candidate_name', e.target.value)} /></Field>
          <Field label="Cliente"><input style={inputStyle} value={form.client_company} onChange={e => set('client_company', e.target.value)} /></Field>
          <Field label="Valor (¥)"><input type="number" style={inputStyle} value={form.amount} onChange={e => set('amount', e.target.value)} /></Field>
          <Field label="Vencimento"><input type="date" style={inputStyle} value={form.due_date} onChange={e => set('due_date', e.target.value)} /></Field>
        </>)}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Btn onClick={save}>Salvar</Btn>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
        </div>
      </Modal>
    </div>
  )
}
