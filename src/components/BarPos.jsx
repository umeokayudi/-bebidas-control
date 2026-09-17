import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'
import { fmtYen, Spinner, SectionTitle } from './utils'
import { AdminPage, PortalSurface, PortalKpi } from './ui/PageLayout'
import { useI18n } from '../lib/i18n'
import AtomicPosPanel from './AtomicPos'
import { hourlyRevenue, hourlySummary, idleSuggestion, checkAndTriggerReorder, todayKey } from '../lib/barPos'

const SUBS = [
  { id: 'caixa', icon: '🧾' },
  { id: 'hora', icon: '⏰' },
  { id: 'estoque', icon: '📦' },
  { id: 'staff', icon: '👥' },
  { id: 'drinkback', icon: '🍸' },
  { id: 'servicos', icon: '🧹' },
]

function missingTable(err) {
  return err?.code === 'PGRST205' || /does not exist|not exist|Could not find/i.test(err?.message || '')
}

// ── FATURAMENTO POR HORA ─────────────────────────────────────
function HourlyTab({ bar }) {
  const { t } = useI18n()
  const [date, setDate] = useState(todayKey())
  const [vendas, setVendas] = useState([])
  const [loading, setLoading] = useState(true)
  const [noTable, setNoTable] = useState(false)

  useEffect(() => { load() }, [bar, date])

  async function load() {
    setLoading(true)
    setNoTable(false)
    const { data, error } = await supabase.from('pos_vendas')
      .select('id,total,criado_em,data,tipo,metodo_pagamento')
      .eq('bar_id', bar.id).eq('data', date).order('criado_em')
    if (error && missingTable(error)) setNoTable(true)
    setVendas(data || [])
    setLoading(false)
  }

  const buckets = useMemo(() => hourlyRevenue(vendas), [vendas])
  const sum = useMemo(() => hourlySummary(buckets), [buckets])
  const max = Math.max(...buckets.map(b => b.total), 1)

  if (loading) return <Spinner />
  if (noTable) return <SetupHint />

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <label className="form-label">{t('barPos.day')}</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <PortalKpi label={t('barPos.dayRevenue')} value={fmtYen(sum.total)} color="var(--green)" />
          <PortalKpi label={t('barPos.daySales')} value={sum.count} color="var(--navy)" />
          <PortalKpi label={t('barPos.ticket')} value={fmtYen(sum.ticket)} color="var(--navy)" />
          <PortalKpi label={t('barPos.peak')} value={sum.count ? `${String(sum.peak.hora).padStart(2, '0')}:00` : '—'} sub={sum.count ? fmtYen(sum.peak.total) : ''} color="var(--gold)" />
        </div>
      </div>

      <PortalSurface title={t('barPos.hourlyTitle')} sub={t('barPos.hourlySub')}>
        <div style={{ display: 'flex', alignItems: 'end', gap: 4, height: 150, overflowX: 'auto', paddingBottom: 4 }}>
          {buckets.map(b => (
            <div key={b.hora} title={`${b.label} · ${fmtYen(b.total)} · ${b.count} vendas`} style={{ flex: 1, minWidth: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{b.total ? fmtYen(b.total).replace('¥', '¥') : ''}</div>
              <div style={{ width: '100%', maxWidth: 26, height: Math.max(4, (b.total / max) * 90), borderRadius: 5, background: b.count ? (b.hora === sum.peak?.hora ? 'var(--gold)' : 'var(--navy)') : 'var(--bg3)', opacity: b.count ? 1 : 0.6 }} />
              <div style={{ fontSize: 9, color: 'var(--text2)' }}>{String(b.hora).padStart(2, '0')}h</div>
            </div>
          ))}
        </div>
      </PortalSurface>

      {sum.idleHours.length > 0 && (
        <PortalSurface title={t('barPos.idleTitle')} sub={t('barPos.idleSub')}>
          {sum.idleHours.slice(0, 8).map(h => (
            <div key={h} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13, flexWrap: 'wrap' }}>
              <strong>{String(h).padStart(2, '0')}:00 — {t('barPos.noMovement')}</strong>
              <span style={{ color: 'var(--text2)' }}>💡 {idleSuggestion(h)}</span>
            </div>
          ))}
        </PortalSurface>
      )}
    </div>
  )
}

// ── ESTOQUE + REPOSIÇÃO ──────────────────────────────────────
function StockTab({ bar }) {
  const { t } = useI18n()
  const [rows, setRows] = useState([])
  const [orders, setOrders] = useState([])
  const [produtos, setProdutos] = useState([])
  const [drinks, setDrinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [noTable, setNoTable] = useState(false)
  const [form, setForm] = useState({ produto_id: '', drink_menu_id: '', current_stock: '', min_stock_level: '5' })
  const [saving, setSaving] = useState(false)
  const [triggering, setTriggering] = useState(null)

  useEffect(() => { load() }, [bar])

  async function load() {
    setLoading(true)
    const [sR, oR, pR, dR] = await Promise.all([
      supabase.from('pos_stock').select('*, produtos(nome), drink_menu(nome)').eq('bar_id', bar.id).order('atualizado_em', { ascending: false }),
      supabase.from('pos_reorder_orders').select('*').eq('bar_id', bar.id).order('criado_em', { ascending: false }).limit(20),
      supabase.from('produtos').select('id,nome').eq('ativo', true).order('nome').limit(200),
      supabase.from('drink_menu').select('id,nome').eq('bar_id', bar.id).order('nome'),
    ])
    if (sR.error && missingTable(sR.error)) setNoTable(true)
    setRows(sR.data || [])
    setOrders(oR.data || [])
    setProdutos(pR.data || [])
    setDrinks(dR.data || [])
    setLoading(false)
  }

  const low = rows.filter(r => +r.current_stock <= +r.min_stock_level)

  async function save() {
    if (!form.produto_id && !form.drink_menu_id) return alert(t('barPos.pickItem'))
    setSaving(true)
    await supabase.from('pos_stock').upsert({
      bar_id: bar.id,
      produto_id: form.produto_id || null,
      drink_menu_id: form.drink_menu_id || null,
      current_stock: +form.current_stock || 0,
      min_stock_level: +form.min_stock_level || 0,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'bar_id,produto_id,drink_menu_id' })
    setForm({ produto_id: '', drink_menu_id: '', current_stock: '', min_stock_level: '5' })
    setSaving(false)
    load()
  }

  async function trigger(row) {
    const sku = row.produtos?.nome || row.drink_menu?.nome || 'Item'
    setTriggering(row.id)
    const r = await checkAndTriggerReorder({
      bar_id: bar.id, sku_nome: sku,
      produto_id: row.produto_id, drink_menu_id: row.drink_menu_id,
      estoque_atual: row.current_stock, estoque_minimo: row.min_stock_level,
    })
    setTriggering(null)
    if (r.triggered) { alert(t('barPos.reorderSent', { qty: r.qtd_sugerida })); load() }
    else alert(r.error || t('barPos.reorderFail'))
  }

  if (loading) return <Spinner />
  if (noTable) return <SetupHint />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div>
        <PortalSurface title={t('barPos.stockLevels')} sub={low.length ? t('barPos.lowAlert', { count: low.length }) : t('barPos.stockOk')}>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <select value={form.produto_id} onChange={e => setForm({ ...form, produto_id: e.target.value, drink_menu_id: '' })}>
                <option value="">{t('barPos.jbmProduct')}</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <select value={form.drink_menu_id} onChange={e => setForm({ ...form, drink_menu_id: e.target.value, produto_id: '' })}>
                <option value="">{t('barPos.menuDrink')}</option>
                {drinks.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
              <input type="number" placeholder={t('barPos.current')} value={form.current_stock} onChange={e => setForm({ ...form, current_stock: e.target.value })} />
              <input type="number" placeholder={t('barPos.minimum')} value={form.min_stock_level} onChange={e => setForm({ ...form, min_stock_level: e.target.value })} />
              <button className="btn-primary" onClick={save} disabled={saving}>{t('common.save')}</button>
            </div>
          </div>
          {rows.map(r => {
            const isLow = +r.current_stock <= +r.min_stock_level
            return (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{r.produtos?.nome || r.drink_menu?.nome || 'Item'}</div>
                  <div style={{ fontSize: 11, color: isLow ? 'var(--red)' : 'var(--text2)', fontWeight: isLow ? 700 : 400 }}>
                    {r.current_stock} / min {r.min_stock_level} {isLow ? `· ⚠️ ${t('barPos.low')}` : ''}
                  </div>
                </div>
                {isLow && <button className="btn-primary" onClick={() => trigger(r)} disabled={triggering === r.id} style={{ padding: '6px 12px', fontSize: 11 }}>{triggering === r.id ? '...' : t('barPos.reorder')}</button>}
              </div>
            )
          })}
          {rows.length === 0 && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t('barPos.noStock')}</div>}
        </PortalSurface>
      </div>
      <PortalSurface title={t('barPos.reorderLog')} sub={t('barPos.reorderLogSub')}>
        {orders.map(o => (
          <div key={o.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong>{o.sku_nome}</strong>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>{o.webhook_status}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
              {t('barPos.suggestQty', { qty: o.qtd_sugerida, cur: o.estoque_atual, min: o.estoque_minimo })} · {o.status}
            </div>
          </div>
        ))}
        {orders.length === 0 && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t('barPos.noOrders')}</div>}
      </PortalSurface>
    </div>
  )
}

// ── STAFF ────────────────────────────────────────────────────
function StaffTab({ bar }) {
  const { t } = useI18n()
  const [staff, setStaff] = useState([])
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [noTable, setNoTable] = useState(false)
  const [form, setForm] = useState({ nome: '', cargo: 'Atendente', salario_base: '', comissao_pct: '' })
  const [shift, setShift] = useState({ staff_id: '', data: todayKey(), hora_inicio: '', hora_fim: '' })

  useEffect(() => { load() }, [bar])

  async function load() {
    setLoading(true)
    const [sR, hR] = await Promise.all([
      supabase.from('pos_staff').select('*').eq('bar_id', bar.id).order('nome'),
      supabase.from('pos_shifts').select('*, pos_staff(nome)').eq('bar_id', bar.id).order('data', { ascending: false }).limit(30),
    ])
    if (sR.error && missingTable(sR.error)) setNoTable(true)
    setStaff(sR.data || [])
    setShifts(hR.data || [])
    setLoading(false)
  }

  async function addStaff() {
    if (!form.nome) return
    await supabase.from('pos_staff').insert({ bar_id: bar.id, nome: form.nome, cargo: form.cargo, salario_base: +form.salario_base || 0, comissao_pct: +form.comissao_pct || 0 })
    setForm({ nome: '', cargo: 'Atendente', salario_base: '', comissao_pct: '' })
    load()
  }

  async function addShift() {
    if (!shift.staff_id || !shift.data) return
    await supabase.from('pos_shifts').insert({ bar_id: bar.id, staff_id: shift.staff_id, data: shift.data, hora_inicio: shift.hora_inicio || null, hora_fim: shift.hora_fim || null })
    setShift({ staff_id: '', data: todayKey(), hora_inicio: '', hora_fim: '' })
    load()
  }

  if (loading) return <Spinner />
  if (noTable) return <SetupHint />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <PortalSurface title={t('barPos.team')}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
          <input placeholder={t('common.name')} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
          <input placeholder={t('barPos.role')} value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 12 }}>
          <input type="number" placeholder={t('barPos.baseSalary')} value={form.salario_base} onChange={e => setForm({ ...form, salario_base: e.target.value })} />
          <input type="number" placeholder={t('barPos.commissionPct')} value={form.comissao_pct} onChange={e => setForm({ ...form, comissao_pct: e.target.value })} />
          <button className="btn-primary" onClick={addStaff}>{t('common.add')}</button>
        </div>
        {staff.filter(s => s.ativo).map(s => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <span><strong>{s.nome}</strong> · {s.cargo}</span>
            <span style={{ color: 'var(--text2)' }}>{fmtYen(s.salario_base)}{+s.comissao_pct ? ` + ${s.comissao_pct}%` : ''}</span>
          </div>
        ))}
      </PortalSurface>
      <PortalSurface title={t('barPos.shifts')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <select value={shift.staff_id} onChange={e => setShift({ ...shift, staff_id: e.target.value })}>
            <option value="">—</option>
            {staff.filter(s => s.ativo).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <input type="date" value={shift.data} onChange={e => setShift({ ...shift, data: e.target.value })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 12 }}>
          <input type="time" value={shift.hora_inicio} onChange={e => setShift({ ...shift, hora_inicio: e.target.value })} />
          <input type="time" value={shift.hora_fim} onChange={e => setShift({ ...shift, hora_fim: e.target.value })} />
          <button className="btn-primary" onClick={addShift}>{t('common.add')}</button>
        </div>
        {shifts.map(h => (
          <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <span><strong>{h.pos_staff?.nome || '—'}</strong> · {h.data}</span>
            <span style={{ color: 'var(--text2)' }}>{h.hora_inicio || '?'}–{h.hora_fim || '?'}</span>
          </div>
        ))}
      </PortalSurface>
    </div>
  )
}

// ── DRINK BACK ───────────────────────────────────────────────
function DrinkBackTab({ bar }) {
  const { t } = useI18n()
  const [agents, setAgents] = useState([])
  const [sales, setSales] = useState([])
  const [recentPos, setRecentPos] = useState([])
  const [loading, setLoading] = useState(true)
  const [noTable, setNoTable] = useState(false)
  const [form, setForm] = useState({ nome: '', regiao: '', comissao_pct: '10', meta_mensal: '' })
  const [link, setLink] = useState({ agent_id: '', pos_venda_id: '' })

  useEffect(() => { load() }, [bar])

  async function load() {
    setLoading(true)
    const [aR, sR, pR] = await Promise.all([
      supabase.from('drink_back_agents').select('*').eq('bar_id', bar.id).order('nome'),
      supabase.from('drink_back_sales').select('*, drink_back_agents(nome)').eq('bar_id', bar.id).order('criado_em', { ascending: false }).limit(40),
      supabase.from('pos_vendas').select('id,total,data,criado_em').eq('bar_id', bar.id).order('criado_em', { ascending: false }).limit(20),
    ])
    if (aR.error && missingTable(aR.error)) setNoTable(true)
    setAgents(aR.data || [])
    setSales(sR.data || [])
    setRecentPos(pR.data || [])
    setLoading(false)
  }

  async function addAgent() {
    if (!form.nome) return
    await supabase.from('drink_back_agents').insert({ bar_id: bar.id, nome: form.nome, regiao: form.regiao, comissao_pct: +form.comissao_pct || 0, meta_mensal: +form.meta_mensal || 0 })
    setForm({ nome: '', regiao: '', comissao_pct: '10', meta_mensal: '' })
    load()
  }

  async function linkSale() {
    if (!link.agent_id || !link.pos_venda_id) return
    const agent = agents.find(a => a.id === link.agent_id)
    const venda = recentPos.find(v => v.id === link.pos_venda_id)
    if (!agent || !venda) return
    const comissao = Math.round((+venda.total || 0) * (+agent.comissao_pct || 0) / 100)
    const { error } = await supabase.from('drink_back_sales').insert({
      bar_id: bar.id, agent_id: agent.id, pos_venda_id: venda.id,
      valor_venda: +venda.total || 0, comissao_valor: comissao,
    })
    if (error) { alert(error.message); return }
    setLink({ agent_id: '', pos_venda_id: '' })
    load()
  }

  const monthKey = new Date().toISOString().slice(0, 7)
  const monthSales = sales.filter(s => (s.criado_em || '').startsWith(monthKey))
  const byAgent = useMemo(() => {
    const m = {}
    for (const s of monthSales) {
      const id = s.agent_id
      if (!id) continue
      m[id] = m[id] || { nome: s.drink_back_agents?.nome || '?', total: 0, comissao: 0, count: 0 }
      m[id].total += +s.valor_venda || 0
      m[id].comissao += +s.comissao_valor || 0
      m[id].count += 1
    }
    return Object.values(m).sort((a, b) => b.total - a.total)
  }, [monthSales])

  if (loading) return <Spinner />
  if (noTable) return <SetupHint />

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        <PortalKpi label={t('barPos.agents')} value={agents.filter(a => a.ativo).length} color="var(--navy)" />
        <PortalKpi label={t('barPos.monthLinks')} value={monthSales.length} color="var(--navy)" />
        <PortalKpi label={t('barPos.monthCommission')} value={fmtYen(monthSales.reduce((a, s) => a + (+s.comissao_valor || 0), 0))} color="var(--gold)" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <PortalSurface title={t('barPos.newAgent')}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input placeholder={t('common.name')} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
            <input placeholder={t('barPos.region')} value={form.regiao} onChange={e => setForm({ ...form, regiao: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 12 }}>
            <input type="number" placeholder={t('barPos.commissionPct')} value={form.comissao_pct} onChange={e => setForm({ ...form, comissao_pct: e.target.value })} />
            <input type="number" placeholder={t('barPos.monthGoal')} value={form.meta_mensal} onChange={e => setForm({ ...form, meta_mensal: e.target.value })} />
            <button className="btn-primary" onClick={addAgent}>{t('common.add')}</button>
          </div>
          <div className="card" style={{ marginTop: 8 }}>
            <SectionTitle sub={t('barPos.linkSub')}>{t('barPos.linkSale')}</SectionTitle>
            <select value={link.agent_id} onChange={e => setLink({ ...link, agent_id: e.target.value })} style={{ width: '100%', marginBottom: 8 }}>
              <option value="">— promoter —</option>
              {agents.filter(a => a.ativo).map(a => <option key={a.id} value={a.id}>{a.nome} ({a.comissao_pct}%)</option>)}
            </select>
            <select value={link.pos_venda_id} onChange={e => setLink({ ...link, pos_venda_id: e.target.value })} style={{ width: '100%', marginBottom: 8 }}>
              <option value="">— {t('barPos.posSale')} —</option>
              {recentPos.map(v => <option key={v.id} value={v.id}>{v.data} · {fmtYen(v.total)}</option>)}
            </select>
            <button className="btn-primary" onClick={linkSale} style={{ width: '100%' }}>{t('barPos.link')}</button>
          </div>
        </PortalSurface>
        <PortalSurface title={t('barPos.ranking')}>
          {byAgent.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span><strong>#{i + 1} {r.nome}</strong> · {r.count} {t('barPos.salesWord')}</span>
              <span style={{ fontWeight: 700 }}>{fmtYen(r.total)} <span style={{ color: 'var(--gold)' }}>({fmtYen(r.comissao)})</span></span>
            </div>
          ))}
          {byAgent.length === 0 && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t('barPos.noLinks')}</div>}
        </PortalSurface>
      </div>
    </div>
  )
}

// ── SERVIÇOS ─────────────────────────────────────────────────
function ServicesTab({ bar }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [noTable, setNoTable] = useState(false)
  const [form, setForm] = useState({ tipo: 'limpeza', titulo: '', data_agendada: '', custo: '', prestador: '' })

  useEffect(() => { load() }, [bar])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('service_orders').select('*').eq('bar_id', bar.id).order('data_agendada', { ascending: true })
    if (error && missingTable(error)) setNoTable(true)
    setOrders(data || [])
    setLoading(false)
  }

  async function save() {
    if (!form.titulo) return
    await supabase.from('service_orders').insert({
      bar_id: bar.id, tipo: form.tipo, titulo: form.titulo,
      data_agendada: form.data_agendada || null, custo: +form.custo || 0,
      prestador: form.prestador, status: 'aberto', criado_por: user?.id,
    })
    setForm({ tipo: 'limpeza', titulo: '', data_agendada: '', custo: '', prestador: '' })
    load()
  }

  async function setStatus(id, status) {
    await supabase.from('service_orders').update({ status }).eq('id', id)
    load()
  }

  if (loading) return <Spinner />
  if (noTable) return <SetupHint />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <PortalSurface title={t('barPos.newService')}>
        <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} style={{ width: '100%', marginBottom: 8 }}>
          <option value="limpeza">{t('barPos.cleaning')}</option>
          <option value="manutencao">{t('barPos.maintenance')}</option>
        </select>
        <input placeholder={t('barPos.serviceTitle')} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <input type="date" value={form.data_agendada} onChange={e => setForm({ ...form, data_agendada: e.target.value })} />
          <input type="number" placeholder={t('barPos.cost')} value={form.custo} onChange={e => setForm({ ...form, custo: e.target.value })} />
        </div>
        <input placeholder={t('barPos.provider')} value={form.prestador} onChange={e => setForm({ ...form, prestador: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
        <button className="btn-primary" onClick={save} style={{ width: '100%' }}>{t('barPos.schedule')}</button>
      </PortalSurface>
      <PortalSurface title={t('barPos.serviceHistory')}>
        {orders.map(o => (
          <div key={o.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong>{o.titulo}</strong>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>{o.tipo} · {o.status}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{o.data_agendada || '—'}{o.custo ? ` · ${fmtYen(o.custo)}` : ''}{o.prestador ? ` · ${o.prestador}` : ''}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {o.status !== 'concluido' && <button onClick={() => setStatus(o.id, 'concluido')} style={{ fontSize: 11 }}>✓ {t('barPos.done')}</button>}
              {o.status === 'aberto' && <button onClick={() => setStatus(o.id, 'agendado')} style={{ fontSize: 11 }}>{t('barPos.scheduleAction')}</button>}
            </div>
          </div>
        ))}
        {orders.length === 0 && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t('barPos.noServices')}</div>}
      </PortalSurface>
    </div>
  )
}

function SetupHint() {
  const { t } = useI18n()
  return (
    <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 12, padding: 16, fontSize: 13 }}>
      <strong>{t('atomicPos.setupRequired')}</strong>
      <p style={{ margin: '8px 0', color: '#92400e' }}>{t('barPos.setupHint')}</p>
    </div>
  )
}

// ── SUITE PRINCIPAL ──────────────────────────────────────────
export default function BarPosSuite() {
  const { t } = useI18n()
  const [bars, setBars] = useState([])
  const [barId, setBarId] = useState('')
  const [sub, setSub] = useState('caixa')

  useEffect(() => {
    supabase.from('bars').select('id,nome').order('nome').then(({ data }) => {
      setBars(data || [])
      if (data?.length && !barId) setBarId(data[0].id)
    })
  }, [])

  const bar = bars.find(b => b.id === barId)

  return (
    <AdminPage title={t('nav.pos')} subtitle={t('barPos.subtitle')}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <label className="form-label">{t('common.bar')}</label>
          <select value={barId} onChange={e => setBarId(e.target.value)} style={{ minWidth: 220 }}>
            {bars.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', paddingBottom: 10 }}>{t('barPos.jbmSafe')}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {SUBS.map(s => (
          <button key={s.id} onClick={() => setSub(s.id)} style={{
            padding: '10px 18px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: sub === s.id ? 'var(--navy)' : 'var(--bg2)',
            color: sub === s.id ? '#fff' : 'var(--text2)',
            border: sub === s.id ? 'none' : '1px solid var(--border)',
          }}>
            {s.icon} {t(`barPos.tab_${s.id}`)}
          </button>
        ))}
      </div>

      {!bar ? <Spinner /> : (
        <div className="fade-in" key={sub + bar.id}>
          {sub === 'caixa' && <AtomicPosPanel bar={bar} />}
          {sub === 'hora' && <HourlyTab bar={bar} />}
          {sub === 'estoque' && <StockTab bar={bar} />}
          {sub === 'staff' && <StaffTab bar={bar} />}
          {sub === 'drinkback' && <DrinkBackTab bar={bar} />}
          {sub === 'servicos' && <ServicesTab bar={bar} />}
        </div>
      )}
    </AdminPage>
  )
}
