import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../Auth'
import { useI18n } from '../../lib/i18n'
import { fmtYen, fmtDate, Spinner } from '../utils'
import { PortalAlert, PortalSurface } from '../ui/PageLayout'
import { dailyUsage, findReorderCandidates, runAutoReorder, savePosConfig, stockMapFromMovs, dispatchReorderWebhook } from '../../lib/posEngine'
import { Field, PosModal, StatCard, StatGrid, StatusPill, fmtQty } from './PosShared'

export default function PosStock({ bar, data, reload }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { config, produtos } = data
  const [movimentos, setMovimentos] = useState(null)
  const [regras, setRegras] = useState({})
  const [eventos, setEventos] = useState([])
  const [search, setSearch] = useState('')
  const [onlyAlerts, setOnlyAlerts] = useState(false)
  const [editMin, setEditMin] = useState(null)
  const [adjust, setAdjust] = useState(null)
  const [adjustQty, setAdjustQty] = useState('1')
  const [saving, setSaving] = useState(false)
  const [cfg, setCfg] = useState({ auto_pedido: config.auto_pedido, webhook_url: config.webhook_url || '', dias_cobertura: config.dias_cobertura })
  const [msg, setMsg] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => { load() }, [bar.id])

  async function load() {
    const [mR, rR, eR] = await Promise.all([
      supabase.from('estoque_movimentos').select('*').eq('bar_id', bar.id).order('criado_em', { ascending: false }).limit(2000),
      supabase.from('estoque_regras').select('*').eq('bar_id', bar.id),
      supabase.from('pos_reposicao_eventos').select('*, produtos(nome), pedidos(status)').eq('bar_id', bar.id).order('criado_em', { ascending: false }).limit(30),
    ])
    setMovimentos(mR.data || [])
    const map = {}
    for (const r of rR.data || []) map[r.produto_id] = +r.minimo || 0
    setRegras(map)
    setEventos(eR.data || [])
  }

  const stockMap = useMemo(() => stockMapFromMovs(movimentos || []), [movimentos])

  const list = useMemo(() => produtos.map(p => {
    const stock = Math.max(0, stockMap[p.id] || 0)
    const minimo = regras[p.id] || 0
    const uso = dailyUsage(movimentos || [], p.id)
    const daysLeft = uso > 0 ? Math.floor(stock / uso) : null
    return { ...p, stock, minimo, uso, daysLeft, status: minimo > 0 && stock <= 0 ? 'out' : minimo > 0 && stock <= minimo ? 'low' : 'ok' }
  }), [produtos, stockMap, regras, movimentos])

  const filtered = list.filter(p => {
    if (onlyAlerts && p.status === 'ok') return false
    if (!search) return true
    const s = search.toLowerCase()
    return p.nome.toLowerCase().includes(s) || (p.categoria || '').toLowerCase().includes(s)
  })

  const candidates = useMemo(() => findReorderCandidates({
    produtos, movimentos: movimentos || [], regras, config, stockMap, openOrderProdIds: new Set(),
  }), [produtos, movimentos, regras, config, stockMap])

  const stockValue = list.reduce((a, p) => a + p.stock * (+p.preco_venda || 0), 0)

  async function saveMin(prodId, val) {
    const minimo = Math.max(0, +val || 0)
    await supabase.from('estoque_regras').upsert({ bar_id: bar.id, produto_id: prodId, minimo }, { onConflict: 'bar_id,produto_id' })
    setRegras(prev => ({ ...prev, [prodId]: minimo }))
    setEditMin(null)
  }

  async function doAdjust(tipo) {
    const qtd = +adjustQty
    if (!adjust || !qtd || qtd <= 0) return
    setSaving(true)
    await supabase.from('estoque_movimentos').insert({
      bar_id: bar.id, produto_id: adjust.id, tipo, qtd, origem: 'manual',
      obs: tipo === 'entrada' ? 'Stock added' : 'Used', criado_por: user?.id || null,
    })
    setSaving(false)
    setAdjust(null)
    setAdjustQty('1')
    load()
  }

  async function saveCfg() {
    setSaving(true)
    try {
      await savePosConfig(supabase, bar.id, { auto_pedido: !!cfg.auto_pedido, webhook_url: cfg.webhook_url.trim() || null, dias_cobertura: Math.max(1, +cfg.dias_cobertura || 7) })
      setMsg(t('pos.saved'))
      reload()
    } catch (e) { setMsg(e.message) } finally { setSaving(false) }
  }

  async function checkNow() {
    setChecking(true)
    setMsg('')
    try {
      const r = await runAutoReorder(supabase, { bar, user, config: { ...config, ...cfg } })
      if (!r.candidates.length) setMsg(t('pos.nothingToReorder'))
      else setMsg(`${t('pos.reorderTriggered', { count: r.candidates.length })}${r.pedido ? ` · ${t('pos.reorderOrderCreated')}` : ''}${r.webhook?.sent ? ` · ${t('pos.webhookSent')}` : r.webhook?.reason === 'noWebhook' ? ` · ${t('pos.webhookStatus.sem_webhook')}` : ''}`)
      await load()
    } catch (e) { setMsg(e.message) } finally { setChecking(false) }
  }

  async function resend(ev) {
    setMsg('')
    const r = await dispatchReorderWebhook(supabase, { barId: bar.id, eventoIds: [ev.id] })
    setMsg(r.sent ? t('pos.webhookSent') : `${t('pos.webhookFailed')} ${r.error || r.reason || r.status || ''}`)
    load()
  }

  if (!movimentos) return <Spinner text={t('pos.loading')} />

  const colors = { out: '#c0392b', low: '#e67e22', ok: 'var(--green)' }

  return (
    <div>
      <StatGrid>
        <StatCard label={t('pos.trackedProducts')} value={list.filter(p => p.stock > 0 || p.minimo > 0).length} sub={t('pos.withMinRule', { count: list.filter(p => p.minimo > 0).length })} />
        <StatCard label={t('pos.needAttention')} value={candidates.length} color={candidates.length ? '#c0392b' : 'var(--green)'} icon={candidates.length ? '🚨' : '✅'} />
        <StatCard label={t('pos.stockValue')} value={fmtYen(stockValue)} sub={t('pos.stockValueSub')} />
        <StatCard label={t('pos.autoReorder')} value={config.auto_pedido ? t('common.yes') : t('common.no')} sub={config.webhook_url ? t('pos.webhookConfigured') : t('pos.webhookMissing')} color={config.auto_pedido ? 'var(--green)' : 'var(--text2)'} />
      </StatGrid>

      {candidates.length > 0 && (
        <PortalAlert variant="amber">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700 }}>⚠️ {t('pos.lowStockAlert', { count: candidates.length })}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{candidates.map(c => `${c.produto.nome} ${fmtQty(c.estoque_atual)}/${c.minimo} → +${c.qtd_sugerida}`).join(' · ')}</div>
            </div>
            <button className="btn-primary" onClick={checkNow} disabled={checking} style={{ padding: '8px 16px', borderRadius: 10 }}>{checking ? '…' : t('pos.runReorderNow')}</button>
          </div>
        </PortalAlert>
      )}
      {msg && <div style={{ fontSize: 12, color: 'var(--navy)', fontWeight: 600, marginBottom: 12 }}>{msg}</div>}

      <div className="grid2" style={{ alignItems: 'start', gridTemplateColumns: '3fr 2fr' }}>
        <PortalSurface
          title={t('pos.stockLevels')}
          sub={t('pos.stockLevelsSub')}
          headerRight={(
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} style={{ width: 140, fontSize: 12 }} />
              <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={onlyAlerts} onChange={e => setOnlyAlerts(e.target.checked)} style={{ width: 'auto' }} /> {t('pos.onlyAlerts')}
              </label>
            </div>
          )}
        >
          {filtered.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('common.empty')}</div>}
          {filtered.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors[p.status], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                  {p.categoria}{p.uso > 0 ? ` · ${t('pos.usagePerDay', { qty: fmtQty(p.uso) })}` : ''}{p.daysLeft !== null ? ` · ${t('pos.daysLeft', { days: p.daysLeft })}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 46 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: colors[p.status], lineHeight: 1 }}>{fmtQty(p.stock)}</div>
                <div style={{ fontSize: 9, color: 'var(--text2)', textTransform: 'uppercase' }}>{t('pos.stock')}</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 46 }}>
                {editMin === p.id ? (
                  <input type="number" min="0" defaultValue={p.minimo} autoFocus style={{ width: 52, padding: 4, textAlign: 'center' }}
                    onBlur={e => saveMin(p.id, e.target.value)} onKeyDown={e => e.key === 'Enter' && saveMin(p.id, e.target.value)} />
                ) : (
                  <div onClick={() => setEditMin(p.id)} style={{ cursor: 'pointer' }} title={t('pos.setMinHint')}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: p.minimo > 0 ? 'var(--navy)' : 'var(--text3)' }}>{p.minimo > 0 ? p.minimo : '—'}</div>
                    <div style={{ fontSize: 9, color: 'var(--text2)', textTransform: 'uppercase' }}>{t('pos.min')}</div>
                  </div>
                )}
              </div>
              <button onClick={() => { setAdjust(p); setAdjustQty('1') }} style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8 }}>{t('pos.adjust')}</button>
            </div>
          ))}
        </PortalSurface>

        <div>
          <PortalSurface title={t('pos.reorderSettings')} sub={t('pos.reorderSettingsSub')}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
              <input type="checkbox" checked={!!cfg.auto_pedido} onChange={e => setCfg({ ...cfg, auto_pedido: e.target.checked })} style={{ width: 'auto' }} />
              {t('pos.autoCreateOrder')}
            </label>
            <Field label={t('pos.webhookUrl')}>
              <input placeholder="https://hook.eu1.make.com/…" value={cfg.webhook_url} onChange={e => setCfg({ ...cfg, webhook_url: e.target.value })} />
            </Field>
            <Field label={t('pos.coverDays')}>
              <input type="number" min="1" value={cfg.dias_cobertura} onChange={e => setCfg({ ...cfg, dias_cobertura: e.target.value })} />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={saveCfg} disabled={saving} style={{ flex: 1, padding: 9 }}>{saving ? '…' : t('common.save')}</button>
              <button onClick={checkNow} disabled={checking} style={{ flex: 1, padding: 9 }}>{checking ? '…' : t('pos.runReorderNow')}</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 10, lineHeight: 1.5 }}>{t('pos.reorderHelp')}</div>
          </PortalSurface>

          <PortalSurface title={t('pos.reorderLog')} sub={t('pos.reorderLogSub')}>
            {eventos.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.noReorderEvents')}</div> : eventos.map(e => (
              <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{e.produtos?.nome || '?'} <span style={{ color: 'var(--text2)', fontWeight: 400 }}>×{fmtQty(e.qtd_sugerida)}</span></span>
                  <StatusPill status={e.webhook_status} label={t(`pos.webhookStatus.${e.webhook_status}`)} />
                </div>
                <div style={{ color: 'var(--text2)', marginTop: 2, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span>{fmtDate(e.criado_em?.slice(0, 10))} · {t('pos.stockMinLine', { stock: fmtQty(e.estoque_atual), min: fmtQty(e.minimo) })}</span>
                  <span>
                    {e.pedido_id ? <>{t('pos.jbmOrder')}: <StatusPill status={e.pedidos?.status || 'pendente'} label={t(`orderStatus.${e.pedidos?.status || 'pendente'}`)} /></> : t('pos.noOrder')}
                    {e.webhook_status !== 'enviado' && <button onClick={() => resend(e)} style={{ marginLeft: 6, fontSize: 10, padding: '1px 8px', borderRadius: 6 }}>{t('pos.resend')}</button>}
                  </span>
                </div>
              </div>
            ))}
          </PortalSurface>
        </div>
      </div>

      <PosModal open={!!adjust} title={adjust?.nome} onClose={() => setAdjust(null)} width={340}>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>
          {t('pos.currentStock')}: <strong style={{ color: 'var(--navy)' }}>{fmtQty(adjust?.stock)}</strong>
          {adjust?.minimo > 0 && <> · {t('pos.min')}: <strong>{adjust.minimo}</strong></>}
        </div>
        <input type="number" min="0.5" step="0.5" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} autoFocus
          style={{ width: '100%', padding: 12, fontSize: 20, textAlign: 'center', fontWeight: 700, marginBottom: 14 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button onClick={() => doAdjust('entrada')} disabled={saving} style={{ padding: 12, borderRadius: 12, border: 'none', background: 'var(--green)', color: '#fff', fontWeight: 700 }}>+ {t('pos.addStock')}</button>
          <button onClick={() => doAdjust('saida')} disabled={saving} style={{ padding: 12, borderRadius: 12, border: 'none', background: '#e67e22', color: '#fff', fontWeight: 700 }}>− {t('pos.useStock')}</button>
        </div>
      </PosModal>
    </div>
  )
}
