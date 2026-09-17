/**
 * Configuração da operação do bar: horário de funcionamento, meta por
 * hora, webhook da reposição e comissão padrão de drink back.
 */

import { useState } from 'react'
import { useI18n } from '../../lib/i18n'
import { hourLabel } from '../../lib/posHourly'
import { savePosConfig } from '../../lib/posData'
import { Banner, Card, Field, Pill } from './posUi'

export default function PosConfigPanel({ bar, config, onRefresh }) {
  const { t } = useI18n()
  const [form, setForm] = useState({
    hora_abertura: String(config?.hora_abertura ?? 18),
    hora_fechamento: String(config?.hora_fechamento ?? 5),
    meta_faturamento_hora: String(config?.meta_faturamento_hora ?? 0),
    drink_back_comissao_pct: String(config?.drink_back_comissao_pct ?? 20),
    reorder_webhook_url: config?.reorder_webhook_url || '',
    reorder_multiplicador: String(config?.reorder_multiplicador ?? 2),
    reorder_cooldown_horas: String(config?.reorder_cooldown_horas ?? 24),
    auto_reorder_enabled: Boolean(config?.auto_reorder_enabled),
    criar_pedido_jbm: config?.criar_pedido_jbm !== false,
  })
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)

  async function submit() {
    setBusy(true)
    setFeedback(null)
    try {
      await savePosConfig(bar.id, {
        hora_abertura: +form.hora_abertura,
        hora_fechamento: +form.hora_fechamento,
        meta_faturamento_hora: +form.meta_faturamento_hora || 0,
        drink_back_comissao_pct: +form.drink_back_comissao_pct || 0,
        reorder_webhook_url: form.reorder_webhook_url.trim() || null,
        reorder_multiplicador: +form.reorder_multiplicador || 2,
        reorder_cooldown_horas: +form.reorder_cooldown_horas || 0,
        auto_reorder_enabled: form.auto_reorder_enabled,
        criar_pedido_jbm: form.criar_pedido_jbm,
      })
      setFeedback({ tone: 'green', text: t('pos.config.saved') })
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

      <Card title={t('pos.config.hoursTitle')} sub={t('pos.config.hoursSub')}>
        <div className="pos-grid-3">
          <Field label={t('pos.config.openHour')}>
            <select value={form.hora_abertura} onChange={e => setForm({ ...form, hora_abertura: e.target.value })}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </Field>
          <Field label={t('pos.config.closeHour')}>
            <select value={form.hora_fechamento} onChange={e => setForm({ ...form, hora_fechamento: e.target.value })}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </Field>
          <Field label={t('pos.config.hourGoal')} hint={t('pos.config.hourGoalHint')}>
            <input
              type="number"
              min="0"
              value={form.meta_faturamento_hora}
              onChange={e => setForm({ ...form, meta_faturamento_hora: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card title={t('pos.config.reorderTitle')} sub={t('pos.config.reorderSub')}>
        <Field label={t('pos.config.webhookUrl')} hint={t('pos.config.webhookHint')}>
          <input
            type="url"
            placeholder="https://hook.eu2.make.com/..."
            value={form.reorder_webhook_url}
            onChange={e => setForm({ ...form, reorder_webhook_url: e.target.value })}
          />
        </Field>
        <div className="pos-grid-3">
          <Field label={t('pos.config.multiplier')} hint={t('pos.config.multiplierHint')}>
            <input type="number" min="1" step="0.5" value={form.reorder_multiplicador} onChange={e => setForm({ ...form, reorder_multiplicador: e.target.value })} />
          </Field>
          <Field label={t('pos.config.cooldown')} hint={t('pos.config.cooldownHint')}>
            <input type="number" min="0" value={form.reorder_cooldown_horas} onChange={e => setForm({ ...form, reorder_cooldown_horas: e.target.value })} />
          </Field>
          <Field label={t('pos.config.defaultCommission')} hint={t('pos.config.defaultCommissionHint')}>
            <input type="number" min="0" max="100" value={form.drink_back_comissao_pct} onChange={e => setForm({ ...form, drink_back_comissao_pct: e.target.value })} />
          </Field>
        </div>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.auto_reorder_enabled}
            onChange={e => setForm({ ...form, auto_reorder_enabled: e.target.checked })}
            style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
          />
          <span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{t('pos.config.autoReorder')}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginTop: 3, lineHeight: 1.55 }}>
              {t('pos.config.autoReorderHint')}
            </span>
          </span>
        </label>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.criar_pedido_jbm}
            onChange={e => setForm({ ...form, criar_pedido_jbm: e.target.checked })}
            style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
          />
          <span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{t('pos.config.createJbmOrder')}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginTop: 3, lineHeight: 1.55 }}>
              {t('pos.config.createJbmOrderHint')}
            </span>
          </span>
        </label>

        <button type="button" className="btn-primary" disabled={busy} onClick={submit} style={{ padding: '12px 24px', borderRadius: 11 }}>
          {busy ? t('common.saving') : t('pos.config.save')}
        </button>
      </Card>

      <Card title={t('pos.config.separationTitle')} sub={t('pos.config.separationSub')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Pill tone="blue">pos_vendas</Pill>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{t('pos.config.sepPos')}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Pill tone="gold">vendas</Pill>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{t('pos.config.sepJbm')}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Pill tone="green">estoque_movimentos</Pill>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{t('pos.config.sepStock')}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Pill tone="amber">pedidos</Pill>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{t('pos.config.sepPedidos')}</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
