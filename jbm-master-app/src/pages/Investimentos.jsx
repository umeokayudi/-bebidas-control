import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { fmtYen, fmtPct } from '../lib/format'
import { loadInvestments, saveInvestment, saveInvestmentReturn } from '../lib/holdingStorage'
import { PageHeader, StatGrid, TabBar, StatusBadge, Empty, Btn, Field, inputStyle, Modal } from '../lib/sharedUi'

const UNITS = ['HR', 'KuriPuro', 'Logistica', 'Drinks', 'Holding']
const TYPES = ['formacao', 'equipamento', 'adiantamento', 'moradia', 'outro']

export default function Investimentos() {
  const [tab, setTab] = useState('portfolio')
  const [inv, setInv] = useState([])
  const [returns, setReturns] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [retForm, setRetForm] = useState({})

  useEffect(() => { load(); const iv = setInterval(load, 30_000); return () => clearInterval(iv) }, [])

  async function load() {
    const { inv: i, ret: r } = await loadInvestments()
    setInv(i)
    setReturns(r)
  }

  const invested = inv.filter(i => !['quitado', 'perda'].includes(i.status)).reduce((a, i) => a + Number(i.amount_invested || 0), 0)
  const returned = returns.reduce((a, r) => a + Number(r.amount || 0), 0)

  const roiMap = {}
  for (const i of inv) {
    if (!roiMap[i.person_name]) roiMap[i.person_name] = { name: i.person_name, unit: i.unit, invested: 0, returned: 0 }
    roiMap[i.person_name].invested += Number(i.amount_invested || 0)
  }
  for (const r of returns) {
    const invRow = inv.find(i => i.id === r.investment_id)
    const name = invRow?.person_name || r.jbm_investments?.person_name
    if (!name) continue
    if (!roiMap[name]) roiMap[name] = { name, invested: 0, returned: 0 }
    roiMap[name].returned += Number(r.amount || 0)
  }
  const roiList = Object.values(roiMap).map(r => ({ ...r, saldo: r.returned - r.invested, roiPct: r.invested ? ((r.returned / r.invested) * 100) : 0 }))

  function openInvest() {
    setForm({ person_name: '', unit: 'HR', investment_type: 'formacao', amount_invested: '', invested_at: new Date().toISOString().slice(0, 10), expected_return_date: '', expected_return_amount: '', notes: '' })
    setModal('invest')
  }

  function openReturn(investmentId) {
    const row = inv.find(i => i.id === investmentId)
    setRetForm({ investment_id: investmentId, amount: '', return_date: new Date().toISOString().slice(0, 10), source: 'trabalho', notes: '' })
    setRetForm(f => ({ ...f, _person: row }))
    setModal('return')
  }

  async function onSaveInvest() {
    try {
      await saveInvestment(form)
      toast.success('Investimento registrado')
      setModal(null)
      load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function onSaveReturn() {
    try {
      const personMeta = retForm._person || {}
      await saveInvestmentReturn(retForm, { person_name: personMeta.person_name, unit: personMeta.unit })
      toast.success('Retorno registrado')
      setModal(null)
      load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setR = (k, v) => setRetForm(f => ({ ...f, [k]: v }))

  return (
    <div>
      <PageHeader icon="📈" title="JBM Investimentos em Pessoas" color="#34d399">
        <Btn onClick={openInvest}>+ Investir</Btn>
      </PageHeader>

      <StatGrid items={[
        ['Investido (ativo)', invested, '#fbbf24', 'yen'],
        ['Retornado', returned, '#4ade80', 'yen'],
        ['Saldo líquido', returned - invested, returned >= invested ? '#4ade80' : '#f87171', 'yen'],
        ['Pessoas', roiList.length, '#60a5fa'],
      ]} />

      <TabBar tabs={[{ id: 'portfolio', label: 'Portfolio' }, { id: 'roi', label: 'Retorno por pessoa' }, { id: 'historico', label: 'Retornos' }]} active={tab} onChange={setTab} />

      {tab === 'portfolio' && (
        inv.length === 0 ? <Empty text="Nenhum investimento — invista em formação, equipamento, etc." /> :
        inv.map(i => (
          <div key={i.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{i.person_name} <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>({i.unit})</span></div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{i.investment_type} · {i.invested_at}</div>
                {i.notes && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{i.notes}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fbbf24' }}>{fmtYen(i.amount_invested)}</div>
                <StatusBadge status={i.status} />
                <Btn variant="ghost" onClick={() => openReturn(i.id)}>+ Retorno</Btn>
              </div>
            </div>
          </div>
        ))
      )}

      {tab === 'roi' && (
        roiList.length === 0 ? <Empty text="Registre investimentos e retornos para ver ROI" /> :
        roiList.sort((a, b) => b.returned - a.returned).map(r => (
          <div key={r.name} className="card" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{r.unit || '—'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>investiu {fmtYen(r.invested)} → retornou {fmtYen(r.returned)}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: r.saldo >= 0 ? '#4ade80' : '#f87171' }}>
                {r.saldo >= 0 ? '+' : ''}{fmtYen(r.saldo)} ({fmtPct(r.returned, r.invested)})
              </div>
            </div>
          </div>
        ))
      )}

      {tab === 'historico' && (
        returns.length === 0 ? <Empty /> :
        returns.map(r => (
          <div key={r.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13 }}>{r.jbm_investments?.person_name || '—'}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{r.return_date} · {r.source}</div>
            </div>
            <div style={{ fontWeight: 700, color: '#4ade80' }}>+{fmtYen(r.amount)}</div>
          </div>
        ))
      )}

      <Modal open={modal === 'invest'} title="Novo investimento" onClose={() => setModal(null)}>
        <Field label="Pessoa"><input style={inputStyle} value={form.person_name} onChange={e => set('person_name', e.target.value)} /></Field>
        <Field label="Unidade"><select style={inputStyle} value={form.unit} onChange={e => set('unit', e.target.value)}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Tipo"><select style={inputStyle} value={form.investment_type} onChange={e => set('investment_type', e.target.value)}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Valor (¥)"><input type="number" style={inputStyle} value={form.amount_invested} onChange={e => set('amount_invested', e.target.value)} /></Field>
        <Field label="Data"><input type="date" style={inputStyle} value={form.invested_at} onChange={e => set('invested_at', e.target.value)} /></Field>
        <Field label="Retorno esperado (¥)"><input type="number" style={inputStyle} value={form.expected_return_amount} onChange={e => set('expected_return_amount', e.target.value)} /></Field>
        <Field label="Notas"><input style={inputStyle} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
        <Btn onClick={onSaveInvest}>Salvar</Btn>
      </Modal>

      <Modal open={modal === 'return'} title="Registrar retorno" onClose={() => setModal(null)}>
        <Field label="Valor (¥)"><input type="number" style={inputStyle} value={retForm.amount} onChange={e => setR('amount', e.target.value)} /></Field>
        <Field label="Data"><input type="date" style={inputStyle} value={retForm.return_date} onChange={e => setR('return_date', e.target.value)} /></Field>
        <Field label="Fonte"><select style={inputStyle} value={retForm.source} onChange={e => setR('source', e.target.value)}>
          {['trabalho', 'comissao', 'salario', 'bonus', 'outro'].map(s => <option key={s}>{s}</option>)}
        </select></Field>
        <Btn onClick={onSaveReturn}>Salvar retorno</Btn>
      </Modal>
    </div>
  )
}
