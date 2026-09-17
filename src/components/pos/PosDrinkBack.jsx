import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../lib/i18n'
import { fmtYen, fmtDate, Spinner } from '../utils'
import { PortalSurface } from '../ui/PageLayout'
import { Field, ModeButtons, PosModal, StatCard, StatGrid, Pill } from './PosShared'

const EMPTY = { nome: '', apelido: '', regiao: '', telefone: '', comissao_pct: '10', comissao_fixa: '0', meta_mensal: '', notas: '' }

export default function PosDrinkBack({ bar, data, reload }) {
  const { t } = useI18n()
  const { agents, today } = data
  const [mode, setMode] = useState('performance')
  const [month, setMonth] = useState(today.slice(0, 7))
  const [sales, setSales] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [regionFilter, setRegionFilter] = useState('')
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    setSales(null)
    const start = `${month}-01`
    const endD = new Date(`${month}-01T12:00:00`); endD.setMonth(endD.getMonth() + 1); endD.setDate(0)
    const end = `${month}-${String(endD.getDate()).padStart(2, '0')}`
    supabase.from('pos_vendas')
      .select('id, total, comissao_drink_back, drink_back_agent_id, criado_em, data, mesa, pos_vendas_itens(nome, qtd)')
      .eq('bar_id', bar.id).gte('data', start).lte('data', end).not('drink_back_agent_id', 'is', null)
      .order('criado_em', { ascending: false })
      .then(({ data: rows }) => setSales(rows || []))
  }, [bar.id, month])

  const stats = useMemo(() => {
    const m = {}
    for (const v of sales || []) {
      const r = (m[v.drink_back_agent_id] ||= { total: 0, count: 0, comissao: 0, drinks: 0 })
      r.total += +v.total || 0
      r.count += 1
      r.comissao += +v.comissao_drink_back || 0
      r.drinks += (v.pos_vendas_itens || []).reduce((a, it) => a + (+it.qtd || 0), 0)
    }
    return m
  }, [sales])

  const regions = useMemo(() => [...new Set(agents.map(a => (a.regiao || '').trim()).filter(Boolean))].sort(), [agents])
  const list = agents.filter(a => !regionFilter || (a.regiao || '') === regionFilter)
    .map(a => ({ ...a, ...(stats[a.id] || { total: 0, count: 0, comissao: 0, drinks: 0 }) }))
    .sort((a, b) => b.total - a.total)

  const totals = Object.values(stats).reduce((acc, r) => ({ total: acc.total + r.total, comissao: acc.comissao + r.comissao, count: acc.count + r.count }), { total: 0, comissao: 0, count: 0 })
  const byRegion = useMemo(() => {
    const m = {}
    for (const a of agents) {
      const key = (a.regiao || '').trim() || '—'
      const r = (m[key] ||= { regiao: key, agents: 0, active: 0, total: 0, comissao: 0 })
      r.agents += 1
      if (a.ativo) r.active += 1
      r.total += stats[a.id]?.total || 0
      r.comissao += stats[a.id]?.comissao || 0
    }
    return Object.values(m).sort((a, b) => b.total - a.total)
  }, [agents, stats])

  async function save() {
    if (!form.nome.trim()) return
    setSaving(true)
    const payload = {
      bar_id: bar.id, nome: form.nome.trim(), apelido: form.apelido || null, regiao: form.regiao || null, telefone: form.telefone || null,
      comissao_pct: +form.comissao_pct || 0, comissao_fixa: +form.comissao_fixa || 0, meta_mensal: +form.meta_mensal || 0, notas: form.notas || null,
    }
    if (editId) await supabase.from('drink_back_agents').update(payload).eq('id', editId)
    else await supabase.from('drink_back_agents').insert({ ...payload, ativo: true })
    setSaving(false)
    setShowForm(false)
    setEditId(null)
    setForm(EMPTY)
    reload()
  }

  async function toggle(a) {
    await supabase.from('drink_back_agents').update({ ativo: !a.ativo }).eq('id', a.id)
    reload()
  }

  function startEdit(a) {
    setEditId(a.id)
    setForm({ nome: a.nome, apelido: a.apelido || '', regiao: a.regiao || '', telefone: a.telefone || '', comissao_pct: a.comissao_pct ?? 10, comissao_fixa: a.comissao_fixa ?? 0, meta_mensal: a.meta_mensal || '', notas: a.notas || '' })
    setShowForm(true)
  }

  const months = useMemo(() => {
    const out = []
    const d = new Date(`${today}T12:00:00`)
    for (let i = 0; i < 6; i++) { out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); d.setMonth(d.getMonth() - 1) }
    return out
  }, [today])

  return (
    <div>
      <StatGrid>
        <StatCard label={t('pos.agentsActive')} value={agents.filter(a => a.ativo).length} sub={t('pos.regionsCount', { count: regions.length })} icon="💃" />
        <StatCard label={t('pos.drinkBackRevenue')} value={fmtYen(totals.total)} sub={t('pos.salesCount', { count: totals.count })} color="var(--green)" />
        <StatCard label={t('pos.commissionsDue')} value={fmtYen(totals.comissao)} sub={month} color="var(--gold)" />
        <StatCard label={t('pos.goalsHit')} value={`${list.filter(a => a.meta_mensal > 0 && a.total >= a.meta_mensal).length}/${list.filter(a => a.meta_mensal > 0).length}`} sub={t('pos.monthlyGoals')} />
      </StatGrid>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <ModeButtons value={mode} onChange={setMode} options={[['performance', t('pos.performance')], ['regions', t('pos.regionsMap')], ['history', t('common.history')]]} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <select value={month} onChange={e => setMonth(e.target.value)} style={{ width: 'auto' }}>{months.map(m => <option key={m}>{m}</option>)}</select>
          <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={{ width: 'auto' }}>
            <option value="">{t('pos.allRegions')}</option>
            {regions.map(r => <option key={r}>{r}</option>)}
          </select>
          <button className="btn-primary" onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY) }} style={{ padding: '8px 14px', borderRadius: 10 }}>+ {t('pos.addAgent')}</button>
        </div>
      </div>

      {mode === 'performance' && (
        <PortalSurface title={t('pos.performance')} sub={t('pos.performanceSub')}>
          {!sales ? <Spinner /> : list.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.noAgents')}</div> : list.map(a => {
            const meta = +a.meta_mensal || 0
            const pct = meta ? Math.min(100, Math.round((a.total / meta) * 100)) : null
            return (
              <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', opacity: a.ativo ? 1 : 0.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{a.apelido || a.nome} {a.apelido && <span style={{ fontWeight: 400, color: 'var(--text2)', fontSize: 12 }}>({a.nome})</span>}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                      {a.regiao && <Pill>📍 {a.regiao}</Pill>}
                      <span>{+a.comissao_pct || 0}%{+a.comissao_fixa ? ` + ${fmtYen(a.comissao_fixa)}/drink` : ''}</span>
                      {a.telefone && <span>· {a.telefone}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 13 }}>
                    <div style={{ textAlign: 'right' }}><div style={{ fontSize: 10, color: 'var(--text2)' }}>{t('pos.sales')}</div><strong>{a.count}</strong> <span style={{ color: 'var(--text2)', fontSize: 11 }}>· {a.drinks} 🍸</span></div>
                    <div style={{ textAlign: 'right' }}><div style={{ fontSize: 10, color: 'var(--text2)' }}>{t('pos.revenue')}</div><strong>{fmtYen(a.total)}</strong></div>
                    <div style={{ textAlign: 'right' }}><div style={{ fontSize: 10, color: 'var(--text2)' }}>{t('pos.commission')}</div><strong style={{ color: 'var(--gold)' }}>{fmtYen(a.comissao)}</strong></div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => setDetail(a)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6 }}>{t('common.history')}</button>
                      <button onClick={() => startEdit(a)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6 }}>{t('common.edit')}</button>
                      <button onClick={() => toggle(a)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6 }}>{a.ativo ? t('pos.deactivate') : t('pos.activate')}</button>
                    </div>
                  </div>
                </div>
                {pct !== null && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 3 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--gold)' : '#e67e22', borderRadius: 3 }} />
                    </div>
                    <span style={{ color: 'var(--text2)', whiteSpace: 'nowrap' }}>{t('pos.goalProgress', { pct, goal: fmtYen(meta) })}</span>
                  </div>
                )}
              </div>
            )
          })}
        </PortalSurface>
      )}

      {mode === 'regions' && (
        <PortalSurface title={t('pos.regionsMap')} sub={t('pos.regionsMapSub')}>
          {byRegion.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.noAgents')}</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
              {byRegion.map(r => (
                <div key={r.regiao} onClick={() => { setRegionFilter(r.regiao === '—' ? '' : r.regiao); setMode('performance') }} style={{ background: 'var(--bg3)', borderRadius: 12, padding: 14, cursor: 'pointer' }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>📍 {r.regiao}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{t('pos.agentsInRegion', { active: r.active, total: r.agents })}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>{fmtYen(r.total)} <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600 }}>· {fmtYen(r.comissao)}</span></div>
                </div>
              ))}
            </div>
          )}
        </PortalSurface>
      )}

      {mode === 'history' && (
        <PortalSurface title={t('common.history')} sub={month}>
          {!sales ? <Spinner /> : sales.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.noDrinkBackSales')}</div> : sales.filter(v => !regionFilter || (agents.find(a => a.id === v.drink_back_agent_id)?.regiao || '') === regionFilter).map(v => {
            const a = agents.find(x => x.id === v.drink_back_agent_id)
            return (
              <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{a?.apelido || a?.nome || '?'}</strong> — {(v.pos_vendas_itens || []).map(it => `${it.nome} ×${it.qtd}`).join(', ')}
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{fmtDate(v.data)} · {new Date(v.criado_em).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{v.mesa ? ` · ${v.mesa}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><strong>{fmtYen(v.total)}</strong><div style={{ fontSize: 11, color: 'var(--gold)' }}>{fmtYen(v.comissao_drink_back)}</div></div>
              </div>
            )
          })}
        </PortalSurface>
      )}

      <PosModal open={showForm} title={editId ? t('pos.editAgent') : t('pos.addAgent')} onClose={() => setShowForm(false)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label={t('pos.name')}><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} autoFocus /></Field>
          <Field label={t('pos.nickname')}><input value={form.apelido} onChange={e => setForm({ ...form, apelido: e.target.value })} /></Field>
          <Field label={t('pos.region')}><input list="pos-regions" value={form.regiao} onChange={e => setForm({ ...form, regiao: e.target.value })} placeholder="Roppongi, Shibuya…" /></Field>
          <Field label={t('pos.phone')}><input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} /></Field>
          <Field label={t('pos.commissionPct')}><input type="number" min="0" step="0.5" value={form.comissao_pct} onChange={e => setForm({ ...form, comissao_pct: e.target.value })} /></Field>
          <Field label={t('pos.commissionFixed')}><input type="number" min="0" value={form.comissao_fixa} onChange={e => setForm({ ...form, comissao_fixa: e.target.value })} /></Field>
          <Field label={t('pos.monthlyGoal')}><input type="number" min="0" value={form.meta_mensal} onChange={e => setForm({ ...form, meta_mensal: e.target.value })} /></Field>
          <Field label={t('common.notes')}><input value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} /></Field>
        </div>
        <datalist id="pos-regions">{regions.map(r => <option key={r} value={r} />)}</datalist>
        <button className="btn-primary" onClick={save} disabled={saving || !form.nome.trim()} style={{ width: '100%', padding: 11, borderRadius: 10 }}>{saving ? t('common.saving') : t('common.save')}</button>
      </PosModal>

      <PosModal open={!!detail} title={detail ? `${detail.apelido || detail.nome} · ${month}` : ''} onClose={() => setDetail(null)} width={480}>
        {detail && (sales || []).filter(v => v.drink_back_agent_id === detail.id).map(v => (
          <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <div>{(v.pos_vendas_itens || []).map(it => `${it.nome} ×${it.qtd}`).join(', ')}<div style={{ fontSize: 11, color: 'var(--text2)' }}>{fmtDate(v.data)}</div></div>
            <div style={{ textAlign: 'right' }}><strong>{fmtYen(v.total)}</strong><div style={{ fontSize: 11, color: 'var(--gold)' }}>{fmtYen(v.comissao_drink_back)}</div></div>
          </div>
        ))}
        {detail && !(sales || []).some(v => v.drink_back_agent_id === detail.id) && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.noDrinkBackSales')}</div>}
      </PosModal>
    </div>
  )
}
