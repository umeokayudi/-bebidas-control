import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../Auth'
import { useI18n } from '../../lib/i18n'
import { fmtYen, Spinner } from '../utils'
import { PortalAlert, PortalSurface } from '../ui/PageLayout'
import { bandTotals, findReorderCandidates, hourBands, hourlyReport, runAutoReorder, stockMapFromMovs } from '../../lib/posEngine'
import { StatCard, StatGrid, HourBars, fmtQty, StatusPill } from './PosShared'

export default function PosDashboard({ bar, data, reload, onTab }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { config, todaySales, produtos, agents, staff, today } = data
  const [extra, setExtra] = useState(null)
  const [ordering, setOrdering] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadExtra() }, [bar.id, today])

  async function loadExtra() {
    const monthStart = `${today.slice(0, 7)}-01`
    const [mR, rR, tR, sR, eR, vR] = await Promise.all([
      supabase.from('estoque_movimentos').select('produto_id, tipo, qtd, criado_em').eq('bar_id', bar.id).limit(2000),
      supabase.from('estoque_regras').select('produto_id, minimo').eq('bar_id', bar.id),
      supabase.from('bar_turnos').select('*, bar_staff(nome, cargo)').eq('bar_id', bar.id).eq('data', today),
      supabase.from('service_orders').select('id, tipo, titulo, status, data_agendada').eq('bar_id', bar.id).in('status', ['aberto', 'agendado', 'em_andamento']),
      supabase.from('pos_reposicao_eventos').select('*, produtos(nome)').eq('bar_id', bar.id).order('criado_em', { ascending: false }).limit(5),
      supabase.from('pos_vendas').select('id, total, comissao_drink_back, drink_back_agent_id, criado_em').eq('bar_id', bar.id).gte('data', monthStart),
    ])
    const regras = {}
    for (const r of rR.data || []) regras[r.produto_id] = +r.minimo || 0
    setExtra({
      movimentos: mR.data || [], regras, turnos: tR.data || [], services: sR.data || [],
      eventos: eR.data || [], monthSales: vR.data || [],
    })
  }

  const report = useMemo(() => hourlyReport(todaySales, config), [todaySales, config])
  const bands = useMemo(() => bandTotals(todaySales, hourBands(config, 3)), [todaySales, config])
  const custo = todaySales.reduce((a, s) => a + (+s.custo_total || 0), 0)
  const comissoesHoje = todaySales.reduce((a, s) => a + (+s.comissao_drink_back || 0), 0)
  const margem = report.total ? Math.round(((report.total - custo) / report.total) * 100) : 0

  const lowStock = useMemo(() => {
    if (!extra) return []
    return findReorderCandidates({
      produtos, movimentos: extra.movimentos, regras: extra.regras, config,
      stockMap: stockMapFromMovs(extra.movimentos), openOrderProdIds: new Set(),
    })
  }, [extra, produtos, config])

  const agentStats = useMemo(() => {
    if (!extra) return []
    const map = {}
    for (const s of extra.monthSales) {
      if (!s.drink_back_agent_id) continue
      const a = (map[s.drink_back_agent_id] ||= { id: s.drink_back_agent_id, total: 0, count: 0, comissao: 0 })
      a.total += +s.total || 0
      a.count += 1
      a.comissao += +s.comissao_drink_back || 0
    }
    return Object.values(map).map(a => ({ ...a, agent: agents.find(x => x.id === a.id) })).sort((a, b) => b.total - a.total)
  }, [extra, agents])

  async function orderNow(produtoId) {
    setOrdering(produtoId)
    setMsg('')
    try {
      const r = await runAutoReorder(supabase, { bar, user, config, produtoIds: [produtoId], force: true })
      if (!r.candidates.length) setMsg(t('pos.nothingToReorder'))
      else setMsg(r.pedido ? t('pos.reorderOrderCreated') : t('pos.reorderLogged'))
      await loadExtra()
    } catch (e) {
      setMsg(e.message)
    } finally {
      setOrdering(null)
    }
  }

  if (!extra) return <Spinner text={t('pos.loading')} />

  const comissaoMes = agentStats.reduce((a, s) => a + s.comissao, 0)
  const monthTotal = extra.monthSales.reduce((a, s) => a + (+s.total || 0), 0)

  return (
    <div>
      <StatGrid>
        <StatCard label={t('pos.todayRevenue')} value={fmtYen(report.total)} sub={t('pos.salesCount', { count: report.count })} color="var(--green)" icon="💴" />
        <StatCard label={t('pos.avgTicket')} value={fmtYen(report.ticket)} sub={t('pos.perSale')} icon="🧾" />
        <StatCard label={t('pos.marginToday')} value={`${margem}%`} sub={t('pos.costSub', { amount: fmtYen(custo) })} color={margem >= 60 ? 'var(--green)' : margem > 0 ? 'var(--amber)' : 'var(--text2)'} icon="📈" />
        <StatCard label={t('pos.monthRevenue')} value={fmtYen(monthTotal)} sub={t('pos.salesCount', { count: extra.monthSales.length })} icon="📅" />
        <StatCard label={t('pos.drinkBackToday')} value={fmtYen(comissoesHoje)} sub={t('pos.drinkBackMonth', { amount: fmtYen(comissaoMes) })} color="var(--gold)" icon="💃" onClick={() => onTab('drinkback')} />
      </StatGrid>

      {lowStock.length > 0 && (
        <PortalAlert variant="red" onClick={() => onTab('stock')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>🚨 {t('pos.lowStockAlert', { count: lowStock.length })}</div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>{lowStock.slice(0, 4).map(c => `${c.produto.nome} (${fmtQty(c.estoque_atual)}/${c.minimo})`).join(' · ')}{lowStock.length > 4 ? ' …' : ''}</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{t('pos.viewStock')} →</span>
          </div>
        </PortalAlert>
      )}

      <div className="grid2" style={{ alignItems: 'start' }}>
        <PortalSurface title={t('pos.revenueByBand')} sub={t('pos.revenueByBandSub', { open: config.hora_abre, close: config.hora_fecha })}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(bands.length, 4)},1fr)`, gap: 8, marginBottom: 12 }}>
            {bands.map(b => (
              <div key={b.label} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700 }}>{b.label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>{fmtYen(b.total)}</div>
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>{b.count}× · {fmtYen(b.ticket)}</div>
              </div>
            ))}
          </div>
          {report.count > 0 ? <HourBars rows={report.rows} height={70} /> : <div style={{ fontSize: 12, color: 'var(--text3)', padding: '10px 0' }}>{t('pos.noSalesToday')}</div>}
          {report.peak.length > 0 && (
            <div style={{ fontSize: 12, marginTop: 8 }}>
              🔥 {t('pos.peakHours')}: <strong>{report.peak.map(r => r.label).join(', ')}</strong>
              {report.idle.length > 0 && <> · 💤 {t('pos.idleHours')}: <strong>{report.idle.map(r => r.label).join(', ')}</strong></>}
              <button onClick={() => onTab('hours')} style={{ marginLeft: 8, fontSize: 11, padding: '2px 10px', borderRadius: 8 }}>{t('pos.tabHours')} →</button>
            </div>
          )}
        </PortalSurface>

        <PortalSurface title={t('pos.reorderReady')} sub={t('pos.reorderReadySub')}>
          {msg && <div style={{ fontSize: 12, color: 'var(--green)', marginBottom: 8, fontWeight: 600 }}>{msg}</div>}
          {lowStock.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.stockOk')}</div> : lowStock.map(c => (
            <div key={c.produto_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{c.produto.nome}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                  {t('pos.stockLine', { stock: fmtQty(c.estoque_atual), min: c.minimo, usage: fmtQty(c.uso_diario) })}
                </div>
              </div>
              <button className="btn-primary" disabled={ordering === c.produto_id} onClick={() => orderNow(c.produto_id)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, whiteSpace: 'nowrap' }}>
                {ordering === c.produto_id ? '…' : t('pos.orderQty', { qty: c.qtd_sugerida })}
              </button>
            </div>
          ))}
          {extra.eventos.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 6 }}>{t('pos.recentReorders')}</div>
              {extra.eventos.map(e => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '4px 0' }}>
                  <span>{e.produtos?.nome || '?'} ×{fmtQty(e.qtd_sugerida)}</span>
                  <StatusPill status={e.webhook_status} label={t(`pos.webhookStatus.${e.webhook_status}`)} />
                </div>
              ))}
            </div>
          )}
        </PortalSurface>
      </div>

      <div className="grid3" style={{ alignItems: 'start' }}>
        <PortalSurface title={t('pos.drinkBackTop')} sub={t('pos.thisMonth')}>
          {agentStats.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.noDrinkBackSales')}</div> : agentStats.slice(0, 5).map(s => {
            const meta = +s.agent?.meta_mensal || 0
            const pct = meta ? Math.min(100, Math.round((s.total / meta) * 100)) : null
            return (
              <div key={s.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600 }}>{s.agent?.apelido || s.agent?.nome || '?'}</span>
                  <span>{fmtYen(s.total)} · <span style={{ color: 'var(--gold)' }}>{fmtYen(s.comissao)}</span></span>
                </div>
                {pct !== null && (
                  <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, marginTop: 4 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--green)' : 'var(--gold)', borderRadius: 2 }} />
                  </div>
                )}
              </div>
            )
          })}
        </PortalSurface>

        <PortalSurface title={t('pos.onShiftToday')} sub={`${extra.turnos.length} · ${staff.filter(s => s.ativo).length} ${t('pos.activeStaff')}`}>
          {extra.turnos.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.noShifts')} <button onClick={() => onTab('staff')} style={{ fontSize: 11, padding: '2px 10px', borderRadius: 8, marginLeft: 6 }}>{t('pos.tabStaff')}</button></div> : extra.turnos.map(tr => (
            <div key={tr.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600 }}>{tr.bar_staff?.nome} <span style={{ color: 'var(--text2)', fontWeight: 400, fontSize: 11 }}>{tr.bar_staff?.cargo}</span></span>
              <span style={{ color: 'var(--text2)' }}>{String(tr.hora_inicio).slice(0, 5)}–{String(tr.hora_fim).slice(0, 5)}</span>
            </div>
          ))}
        </PortalSurface>

        <PortalSurface title={t('pos.openServices')} sub={t('pos.openServicesSub')}>
          {extra.services.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.noOpenServices')}</div> : extra.services.slice(0, 5).map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.tipo === 'limpeza' ? '🧹' : '🔧'} {s.titulo}</span>
              <StatusPill status={s.status} label={t(`pos.serviceStatus.${s.status}`)} />
            </div>
          ))}
          <button onClick={() => onTab('services')} style={{ marginTop: 10, fontSize: 11, padding: '4px 12px', borderRadius: 8 }}>{t('pos.tabServices')} →</button>
        </PortalSurface>
      </div>
    </div>
  )
}
