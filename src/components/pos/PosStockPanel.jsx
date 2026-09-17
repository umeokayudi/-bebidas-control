/**
 * Módulo 2 — Estoque inteligente e reposição automática.
 *
 * Mostra o saldo do bar (livro `estoque_movimentos`), deixa configurar o
 * reorder point por produto e dispara a ordem de compra para a operação
 * central. A automação vem desligada: o dono liga quando quiser.
 */

import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtYen } from '../utils'
import { useI18n } from '../../lib/i18n'
import { buildReorderPayload, detectReorderNeeds, inventorySummary } from '../../lib/posStock'
import { dispatchReorder, ignoreReorder, resendReorder, savePosConfig } from '../../lib/posData'
import { Banner, Card, EmptyState, Field, Pill, StatGrid, StatTile } from './posUi'

const STATUS_TONE = {
  pendente: 'amber',
  enviado: 'blue',
  pedido_criado: 'green',
  falhou: 'red',
  ignorado: 'neutral',
}

function StatusPill({ status }) {
  const { t } = useI18n()
  return <Pill tone={STATUS_TONE[status] || 'neutral'}>{t(`pos.stock.status.${status}`)}</Pill>
}

export default function PosStockPanel({ bar, config, inventory, reorderRequests, onRefresh }) {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [onlyAlerts, setOnlyAlerts] = useState(false)
  const [editMin, setEditMin] = useState(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const rows = inventory?.rows || []
  const summary = useMemo(() => inventorySummary(rows), [rows])
  const needs = useMemo(
    () => detectReorderNeeds(rows, { multiplicador: config?.reorder_multiplicador }),
    [rows, config]
  )

  const filtered = useMemo(() => {
    let list = rows
    if (onlyAlerts) list = list.filter(r => r.status === 'critical' || r.status === 'low')
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(r => r.nome.toLowerCase().includes(s) || (r.categoria || '').toLowerCase().includes(s))
    }
    return list
  }, [rows, search, onlyAlerts])

  async function saveMinimo(produtoId, value) {
    const minimo = Math.max(0, +value || 0)
    const { error } = await supabase
      .from('estoque_regras')
      .upsert({ bar_id: bar.id, produto_id: produtoId, minimo }, { onConflict: 'bar_id,produto_id' })
    setEditMin(null)
    if (error) setFeedback({ tone: 'red', text: error.message })
    else onRefresh?.()
  }

  async function toggleAuto(next) {
    setBusy(true)
    try {
      await savePosConfig(bar.id, { ...config, auto_reorder_enabled: next })
      setFeedback({
        tone: 'green',
        text: next ? t('pos.stock.autoOn') : t('pos.stock.autoOff'),
      })
      onRefresh?.()
    } catch (e) {
      setFeedback({ tone: 'red', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function fireReorder(itens) {
    if (!itens.length) return
    setBusy(true)
    setFeedback(null)
    try {
      const payload = buildReorderPayload({ bar, itens, config })
      const result = await dispatchReorder({ bar, itens, payload, config })
      if (result.error) {
        setFeedback({ tone: 'red', text: result.error })
      } else {
        const pedido = result.webhook?.pedido
        const parts = [t('pos.stock.reorderSent', { count: itens.length })]
        if (pedido) parts.push(t('pos.stock.pedidoCreated', { amount: fmtYen(pedido.total) }))
        else if (result.webhook?.pedido_erro) parts.push(result.webhook.pedido_erro)
        if (result.webhook?.webhook && !result.webhook.webhook.configurado) {
          parts.push(t('pos.stock.webhookMissing'))
        }
        setFeedback({ tone: 'green', text: parts.join(' · ') })
      }
      onRefresh?.()
    } catch (e) {
      setFeedback({ tone: 'red', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function resend(request) {
    setBusy(true)
    try {
      await resendReorder({ bar, request, config })
      setFeedback({ tone: 'green', text: t('pos.stock.reorderSent', { count: 1 }) })
      onRefresh?.()
    } catch (e) {
      setFeedback({ tone: 'red', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function ignore(request) {
    setBusy(true)
    try {
      await ignoreReorder(request.id)
      onRefresh?.()
    } catch (e) {
      setFeedback({ tone: 'red', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {feedback && <Banner tone={feedback.tone === 'green' ? 'green' : feedback.tone === 'red' ? 'red' : 'amber'}>{feedback.text}</Banner>}

      <StatGrid>
        <StatTile label={t('pos.stock.total')} value={summary.total} />
        <StatTile label={t('pos.stock.critical')} value={summary.critical} color="var(--red)" />
        <StatTile label={t('pos.stock.low')} value={summary.low} color="var(--amber)" />
        <StatTile label={t('pos.stock.ok')} value={summary.ok} color="var(--green)" />
        <StatTile label={t('pos.stock.noRule')} value={summary.semRegra} color="var(--text3)" sub={t('pos.stock.noRuleSub')} />
      </StatGrid>

      <Card
        title={t('pos.stock.autoTitle')}
        sub={t('pos.stock.autoSub')}
        headerRight={(
          <button
            type="button"
            className={config?.auto_reorder_enabled ? 'pos-btn-sm danger' : 'btn-primary'}
            disabled={busy}
            onClick={() => toggleAuto(!config?.auto_reorder_enabled)}
            style={{ padding: '9px 16px', borderRadius: 10 }}
          >
            {config?.auto_reorder_enabled ? t('pos.stock.turnOff') : t('pos.stock.turnOn')}
          </button>
        )}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <Pill tone={config?.auto_reorder_enabled ? 'green' : 'neutral'}>
            {config?.auto_reorder_enabled ? t('pos.stock.autoEnabled') : t('pos.stock.autoDisabled')}
          </Pill>
          <Pill tone={config?.reorder_webhook_url ? 'blue' : 'amber'}>
            {config?.reorder_webhook_url ? t('pos.stock.webhookSet') : t('pos.stock.webhookDefault')}
          </Pill>
          <Pill tone={config?.criar_pedido_jbm !== false ? 'gold' : 'neutral'}>
            {config?.criar_pedido_jbm !== false ? t('pos.stock.jbmOrderOn') : t('pos.stock.jbmOrderOff')}
          </Pill>
        </div>

        {needs.length > 0 ? (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.6 }}>
              {t('pos.stock.readyToOrder', { count: needs.length })}
            </div>
            <div className="pos-table-wrap">
              <table className="pos-table">
                <thead>
                  <tr>
                    <th>{t('pos.stock.product')}</th>
                    <th>{t('pos.stock.stock')}</th>
                    <th>{t('pos.stock.minimum')}</th>
                    <th>{t('pos.stock.suggested')}</th>
                    <th>{t('pos.stock.estimated')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {needs.map(n => (
                    <tr key={n.produto_id}>
                      <td style={{ fontWeight: 600 }}>{n.produto_nome}</td>
                      <td><Pill tone={n.status === 'critical' ? 'red' : 'amber'}>{n.estoque_atual}</Pill></td>
                      <td>{n.minimo}</td>
                      <td style={{ fontWeight: 800 }}>{n.qtd_sugerida}</td>
                      <td>{fmtYen(n.qtd_sugerida * (n.preco_unitario || 0))}</td>
                      <td>
                        <button type="button" className="pos-btn-sm" disabled={busy} onClick={() => fireReorder([n])}>
                          {t('pos.stock.orderOne')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => fireReorder(needs)}
              style={{ width: '100%', marginTop: 14, padding: 13, borderRadius: 12 }}
            >
              {busy ? t('common.saving') : t('pos.stock.orderAll', { count: needs.length })}
            </button>
          </div>
        ) : (
          <EmptyState icon="✅" text={t('pos.stock.nothingToOrder')} />
        )}
      </Card>

      <Card
        title={t('pos.stock.listTitle')}
        sub={t('pos.stock.listSub')}
        headerRight={(
          <button type="button" className="pos-btn-sm" onClick={() => setOnlyAlerts(v => !v)}>
            {onlyAlerts ? t('pos.stock.showAll') : t('pos.stock.onlyAlerts')}
          </button>
        )}
      >
        <input
          placeholder={t('pos.stock.searchProducts')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', marginBottom: 14 }}
        />
        {filtered.length === 0 ? (
          <EmptyState icon="📦" text={t('pos.stock.emptyList')} />
        ) : (
          <div className="pos-table-wrap">
            <table className="pos-table">
              <thead>
                <tr>
                  <th>{t('pos.stock.product')}</th>
                  <th>{t('pos.stock.category')}</th>
                  <th>{t('pos.stock.stock')}</th>
                  <th>{t('pos.stock.minimum')}</th>
                  <th>{t('pos.stock.statusCol')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.nome}</td>
                    <td style={{ color: 'var(--text2)' }}>{r.categoria}</td>
                    <td style={{ fontWeight: 800 }}>{r.stock}</td>
                    <td>
                      {editMin === r.id ? (
                        <input
                          type="number"
                          min="0"
                          defaultValue={r.minimo}
                          autoFocus
                          style={{ width: 66, padding: 5, textAlign: 'center' }}
                          onBlur={e => saveMinimo(r.id, e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveMinimo(r.id, e.target.value)}
                        />
                      ) : (
                        <button type="button" className="pos-btn-sm" onClick={() => setEditMin(r.id)}>
                          {r.minimo > 0 ? r.minimo : t('pos.stock.setRule')}
                        </button>
                      )}
                    </td>
                    <td>
                      <Pill tone={r.status === 'critical' ? 'red' : r.status === 'low' ? 'amber' : r.status === 'ok' ? 'green' : 'neutral'}>
                        {t(`pos.stock.statusValue.${r.status}`)}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={t('pos.stock.historyTitle')} sub={t('pos.stock.historySub')}>
        {(reorderRequests || []).length === 0 ? (
          <EmptyState icon="🧾" text={t('pos.stock.historyEmpty')} />
        ) : (
          (reorderRequests || []).map(r => (
            <div key={r.id} className="pos-row">
              <div className="pos-row-main">
                <div className="pos-row-title">{r.produto_nome || r.sku || '—'}</div>
                <div className="pos-row-sub">
                  {new Date(r.criado_em).toLocaleString()} · {t('pos.stock.historyRow', {
                    stock: r.estoque_atual,
                    min: r.minimo,
                    qty: r.qtd_sugerida,
                  })}
                  {r.webhook_status ? ` · webhook ${r.webhook_status}` : ''}
                </div>
              </div>
              <StatusPill status={r.status} />
              {r.status === 'falhou' && (
                <button type="button" className="pos-btn-sm" disabled={busy} onClick={() => resend(r)}>
                  {t('pos.stock.resend')}
                </button>
              )}
              {(r.status === 'pendente' || r.status === 'falhou') && (
                <button type="button" className="pos-btn-sm danger" disabled={busy} onClick={() => ignore(r)}>
                  {t('pos.stock.ignore')}
                </button>
              )}
            </div>
          ))
        )}
      </Card>

      <Card title={t('pos.stock.tuningTitle')} sub={t('pos.stock.tuningSub')}>
        <div className="pos-grid-2">
          <Field label={t('pos.stock.multiplier')} hint={t('pos.stock.multiplierHint')}>
            <input
              type="number"
              min="1"
              step="0.5"
              defaultValue={config?.reorder_multiplicador ?? 2}
              onBlur={e => savePosConfig(bar.id, { ...config, reorder_multiplicador: +e.target.value || 2 }).then(onRefresh)}
            />
          </Field>
          <Field label={t('pos.stock.cooldown')} hint={t('pos.stock.cooldownHint')}>
            <input
              type="number"
              min="0"
              defaultValue={config?.reorder_cooldown_horas ?? 24}
              onBlur={e => savePosConfig(bar.id, { ...config, reorder_cooldown_horas: +e.target.value || 0 }).then(onRefresh)}
            />
          </Field>
        </div>
      </Card>
    </div>
  )
}
