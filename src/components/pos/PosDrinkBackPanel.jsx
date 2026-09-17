/**
 * Módulo 4 — Drink back (promoters / hostesses).
 * Cadastro com mapeamento regional, comissões vindas do POS e metas.
 */

import { useMemo, useState } from 'react'
import { fmtYen } from '../utils'
import { useI18n } from '../../lib/i18n'
import { aggregateAgents, drinkBackSummary, goalStatus, regionalBreakdown } from '../../lib/drinkBack'
import { payCommissions, saveAgent } from '../../lib/posData'
import { Banner, Card, EmptyState, Field, Pill, StatGrid, StatTile } from './posUi'

const EMPTY_AGENT = {
  nome: '',
  codigo: '',
  regiao: '',
  cidade: '',
  telefone: '',
  comissao_pct: '20',
  meta_mensal: '',
  ativo: true,
}

const GOAL_TONE = { batida: 'green', perto: 'amber', atrasada: 'red', sem_meta: 'neutral' }

export default function PosDrinkBackPanel({ bar, config, drinkBack, mes, onRefresh }) {
  const { t } = useI18n()
  const [form, setForm] = useState(EMPTY_AGENT)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const agents = drinkBack?.agents || []
  const comissoes = drinkBack?.comissoes || []

  const totals = useMemo(
    () => aggregateAgents(agents, comissoes, { mes, config }),
    [agents, comissoes, mes, config]
  )
  const summary = useMemo(() => drinkBackSummary(totals), [totals])
  const regions = useMemo(() => regionalBreakdown(totals), [totals])
  const pendentes = comissoes.filter(c => !c.pago)

  function startEdit(agent) {
    setEditing(agent.id)
    setForm({
      nome: agent.nome || '',
      codigo: agent.codigo || '',
      regiao: agent.regiao || '',
      cidade: agent.cidade || '',
      telefone: agent.telefone || '',
      comissao_pct: String(agent.comissao_pct ?? 20),
      meta_mensal: String(agent.meta_mensal ?? ''),
      ativo: agent.ativo !== false,
    })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(EMPTY_AGENT)
  }

  async function submit() {
    if (!form.nome.trim()) return setFeedback({ tone: 'red', text: t('pos.common.nameRequired') })
    setBusy(true)
    try {
      await saveAgent(bar.id, { ...form, id: editing })
      setFeedback({ tone: 'green', text: t('pos.drinkBack.saved') })
      cancelEdit()
      onRefresh?.()
    } catch (e) {
      setFeedback({ tone: 'red', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function toggleAtivo(agent) {
    setBusy(true)
    try {
      await saveAgent(bar.id, { ...agent, ativo: agent.ativo === false })
      onRefresh?.()
    } catch (e) {
      setFeedback({ tone: 'red', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function payAll(agentId = null) {
    const ids = pendentes.filter(c => !agentId || c.agent_id === agentId).map(c => c.id)
    if (!ids.length) return
    setBusy(true)
    try {
      await payCommissions(ids)
      setFeedback({ tone: 'green', text: t('pos.drinkBack.paid', { count: ids.length }) })
      onRefresh?.()
    } catch (e) {
      setFeedback({ tone: 'red', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {feedback && <Banner tone={feedback.tone === 'green' ? 'green' : 'red'}>{feedback.text}</Banner>}

      <StatGrid>
        <StatTile label={t('pos.drinkBack.activeAgents')} value={summary.agentesAtivos} />
        <StatTile label={t('pos.drinkBack.revenue')} value={fmtYen(summary.base)} sub={t('pos.drinkBack.salesCount', { count: summary.vendas })} color="var(--green)" />
        <StatTile label={t('pos.drinkBack.commission')} value={fmtYen(summary.comissao)} sub={t('pos.drinkBack.costPct', { pct: summary.custoPct })} color="var(--gold)" />
        <StatTile label={t('pos.drinkBack.pending')} value={fmtYen(summary.pendente)} sub={t('pos.drinkBack.pendingSub', { count: pendentes.length })} color={summary.pendente > 0 ? 'var(--amber)' : 'var(--text)'} />
        <StatTile label={t('pos.drinkBack.topAgent')} value={summary.topAgente?.nome || '—'} sub={summary.topAgente ? fmtYen(summary.topAgente.base) : t('pos.drinkBack.noSales')} />
      </StatGrid>

      {summary.pendente > 0 && (
        <Banner
          tone="navy"
          title={t('pos.drinkBack.payoutTitle', { amount: fmtYen(summary.pendente) })}
          action={(
            <button type="button" className="pos-btn-sm" disabled={busy} onClick={() => payAll()}>
              {t('pos.drinkBack.payAll')}
            </button>
          )}
        >
          {t('pos.drinkBack.payoutSub', { count: pendentes.length, month: mes })}
        </Banner>
      )}

      <Card title={t('pos.drinkBack.rankingTitle')} sub={t('pos.drinkBack.rankingSub', { month: mes })}>
        {totals.length === 0 ? (
          <EmptyState icon="⭐" text={t('pos.drinkBack.noAgents')} />
        ) : (
          <div className="pos-table-wrap">
            <table className="pos-table">
              <thead>
                <tr>
                  <th>{t('pos.drinkBack.agent')}</th>
                  <th>{t('pos.drinkBack.region')}</th>
                  <th>{t('pos.drinkBack.sales')}</th>
                  <th>{t('pos.drinkBack.revenue')}</th>
                  <th>{t('pos.drinkBack.pct')}</th>
                  <th>{t('pos.drinkBack.commission')}</th>
                  <th>{t('pos.drinkBack.goal')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {totals.map(a => (
                  <tr key={a.id} style={{ opacity: a.ativo ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 700 }}>{a.nome}</td>
                    <td style={{ color: 'var(--text2)' }}>{a.regiao || '—'}{a.cidade ? ` · ${a.cidade}` : ''}</td>
                    <td>{a.vendas}</td>
                    <td style={{ fontWeight: 700 }}>{fmtYen(a.base)}</td>
                    <td>{a.comissao_pct}%</td>
                    <td style={{ color: 'var(--gold)', fontWeight: 700 }}>{fmtYen(a.comissao)}</td>
                    <td>
                      {a.meta_mensal > 0
                        ? <Pill tone={GOAL_TONE[goalStatus(a)]}>{a.metaPct}%</Pill>
                        : <span style={{ color: 'var(--text3)' }}>—</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="pos-btn-sm" onClick={() => startEdit(agents.find(x => x.id === a.id) || a)}>
                        {t('pos.common.edit')}
                      </button>
                      {a.pendente > 0 && (
                        <button type="button" className="pos-btn-sm" disabled={busy} onClick={() => payAll(a.id)} style={{ marginLeft: 6 }}>
                          {t('pos.drinkBack.pay')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="pos-grid-2">
        <Card title={editing ? t('pos.drinkBack.editAgent') : t('pos.drinkBack.newAgent')} sub={t('pos.drinkBack.formSub')}>
          <Field label={t('pos.common.name')}>
            <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
          </Field>
          <div className="pos-grid-2">
            <Field label={t('pos.drinkBack.region')}>
              <input value={form.regiao} onChange={e => setForm({ ...form, regiao: e.target.value })} placeholder={t('pos.drinkBack.regionPlaceholder')} />
            </Field>
            <Field label={t('pos.drinkBack.city')}>
              <input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} />
            </Field>
          </div>
          <div className="pos-grid-2">
            <Field label={t('pos.drinkBack.code')}>
              <input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} />
            </Field>
            <Field label={t('pos.common.phone')}>
              <input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} />
            </Field>
          </div>
          <div className="pos-grid-2">
            <Field label={t('pos.drinkBack.commissionPct')} hint={t('pos.drinkBack.commissionHint', { pct: config?.drink_back_comissao_pct ?? 20 })}>
              <input type="number" min="0" max="100" value={form.comissao_pct} onChange={e => setForm({ ...form, comissao_pct: e.target.value })} />
            </Field>
            <Field label={t('pos.drinkBack.monthlyGoal')}>
              <input type="number" min="0" value={form.meta_mensal} onChange={e => setForm({ ...form, meta_mensal: e.target.value })} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-primary" disabled={busy} onClick={submit} style={{ flex: 1, padding: 12, borderRadius: 11 }}>
              {busy ? t('common.saving') : editing ? t('pos.common.save') : t('pos.drinkBack.addAgent')}
            </button>
            {editing && (
              <button type="button" className="pos-btn-sm" onClick={cancelEdit} style={{ padding: '12px 16px' }}>
                {t('pos.common.cancel')}
              </button>
            )}
          </div>
        </Card>

        <Card title={t('pos.drinkBack.regionTitle')} sub={t('pos.drinkBack.regionSub')}>
          {regions.length === 0 ? (
            <EmptyState icon="🗺️" text={t('pos.drinkBack.noRegions')} />
          ) : (
            regions.map(r => (
              <div key={r.regiao} className="pos-row">
                <div className="pos-row-main">
                  <div className="pos-row-title">{r.regiao}</div>
                  <div className="pos-row-sub">
                    {t('pos.drinkBack.regionRow', { agents: r.agentes, sales: r.vendas })}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800 }}>{fmtYen(r.base)}</div>
                  <div style={{ fontSize: 11, color: 'var(--gold)' }}>{fmtYen(r.comissao)}</div>
                </div>
              </div>
            ))
          )}

          <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)', marginBottom: 8 }}>
              {t('pos.drinkBack.inactive')}
            </div>
            {agents.filter(a => a.ativo === false).length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.drinkBack.allActive')}</div>
            ) : (
              agents.filter(a => a.ativo === false).map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                  <span style={{ fontSize: 12 }}>{a.nome}</span>
                  <button type="button" className="pos-btn-sm" disabled={busy} onClick={() => toggleAtivo(a)}>
                    {t('pos.common.reactivate')}
                  </button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
