/**
 * Painel do dono do bar — o "Dashboard Inicial" da especificação:
 * faturamento do dia por faixa horária, alertas de estoque prontos para
 * recompra e métricas rápidas de drink back.
 */

import { useMemo } from 'react'
import { fmtYen } from '../utils'
import { useI18n } from '../../lib/i18n'
import {
  buildHourlyBuckets,
  dayTotals,
  hourRangeLabel,
  idleHours,
  peakHours,
  suggestIdlePromotions,
} from '../../lib/posHourly'
import { inventorySummary } from '../../lib/posStock'
import { drinkBackSummary } from '../../lib/drinkBack'
import { summarize as summarizeServices } from '../../lib/serviceOrders'
import { Banner, Card, HourBars, StatGrid, StatTile, Pill } from './posUi'

const IDLE_LABEL = {
  happy_hour: 'pos.idle.happyHour',
  reserva: 'pos.idle.reserva',
  evento: 'pos.idle.evento',
}

export default function PosDashboard({
  config,
  todaySales,
  weekSales,
  inventoryRows,
  agentTotals,
  serviceOrders,
  onNav,
}) {
  const { t } = useI18n()

  const buckets = useMemo(
    () => buildHourlyBuckets(todaySales, {
      openHour: config?.hora_abertura,
      closeHour: config?.hora_fechamento,
    }),
    [todaySales, config]
  )

  const totals = useMemo(() => dayTotals(todaySales), [todaySales])
  const weekTotals = useMemo(() => dayTotals(weekSales), [weekSales])
  const peaks = useMemo(() => peakHours(buckets, 2), [buckets])
  const idles = useMemo(
    () => idleHours(buckets, { limit: 3, metaHora: config?.meta_faturamento_hora }),
    [buckets, config]
  )
  const suggestions = useMemo(
    () => suggestIdlePromotions(buckets, { limit: 3, metaHora: config?.meta_faturamento_hora }),
    [buckets, config]
  )
  const stock = useMemo(() => inventorySummary(inventoryRows), [inventoryRows])
  const drinkBack = useMemo(() => drinkBackSummary(agentTotals), [agentTotals])
  const services = useMemo(() => summarizeServices(serviceOrders), [serviceOrders])

  const criticos = (inventoryRows || []).filter(r => r.status === 'critical').slice(0, 6)
  const baixos = (inventoryRows || []).filter(r => r.status === 'low').slice(0, 6)
  const diasSemana = new Set((weekSales || []).map(v => v.data)).size || 1

  return (
    <div>
      {stock.critical > 0 && (
        <Banner
          tone="red"
          title={t('pos.dash.outOfStockTitle', { count: stock.critical })}
          action={(
            <button type="button" className="pos-btn-sm" onClick={() => onNav('estoque')}>
              {t('pos.dash.reorderNow')}
            </button>
          )}
        >
          {criticos.map(p => p.nome).join(' · ')}
        </Banner>
      )}

      {stock.low > 0 && (
        <Banner
          tone="amber"
          title={t('pos.dash.lowStockTitle', { count: stock.low })}
          action={(
            <button type="button" className="pos-btn-sm" onClick={() => onNav('estoque')}>
              {t('pos.dash.seeStock')}
            </button>
          )}
        >
          {baixos.map(p => `${p.nome} — ${p.stock}/${p.minimo}`).join(' · ')}
        </Banner>
      )}

      <StatGrid>
        <StatTile
          label={t('pos.dash.todayRevenue')}
          value={fmtYen(totals.faturamento)}
          sub={t('pos.dash.salesCount', { count: totals.vendas })}
          color="var(--green)"
        />
        <StatTile
          label={t('pos.dash.avgTicket')}
          value={fmtYen(totals.ticketMedio)}
          sub={t('pos.dash.discountGiven', { amount: fmtYen(totals.desconto) })}
        />
        <StatTile
          label={t('pos.dash.peakHour')}
          value={peaks[0] ? hourRangeLabel(peaks[0].hora) : '—'}
          sub={peaks[0] ? fmtYen(peaks[0].faturamento) : t('pos.dash.noSalesYet')}
          color="var(--navy)"
        />
        <StatTile
          label={t('pos.dash.weekAvg')}
          value={fmtYen(Math.round(weekTotals.faturamento / diasSemana))}
          sub={t('pos.dash.weekDays', { days: diasSemana })}
        />
        <StatTile
          label={t('pos.dash.drinkBack')}
          value={fmtYen(drinkBack.comissao)}
          sub={t('pos.dash.drinkBackSub', { pct: drinkBack.custoPct, count: drinkBack.vendas })}
          color="var(--gold)"
          onClick={() => onNav('drinkback')}
        />
        <StatTile
          label={t('pos.dash.services')}
          value={services.abertos}
          sub={services.atrasados > 0
            ? t('pos.dash.servicesLate', { count: services.atrasados })
            : t('pos.dash.servicesOk')}
          color={services.atrasados > 0 ? 'var(--red)' : 'var(--text)'}
          onClick={() => onNav('servicos')}
        />
      </StatGrid>

      <Card
        title={t('pos.dash.hourlyTitle')}
        sub={t('pos.dash.hourlySub', {
          open: String(config?.hora_abertura ?? 18).padStart(2, '0'),
          close: String(config?.hora_fechamento ?? 5).padStart(2, '0'),
        })}
      >
        <HourBars
          buckets={buckets}
          peaks={peaks}
          idles={idles}
          emptyLabel={t('pos.dash.noSalesYet')}
        />
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12, fontSize: 11, color: 'var(--text2)' }}>
          <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: '#1a7a5e', marginRight: 5 }} />{t('pos.dash.legendPeak')}</span>
          <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: '#e6912c', marginRight: 5 }} />{t('pos.dash.legendIdle')}</span>
          <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: 'var(--navy)', marginRight: 5 }} />{t('pos.dash.legendNormal')}</span>
        </div>
      </Card>

      <Card title={t('pos.dash.idleTitle')} sub={t('pos.dash.idleSub')}>
        {suggestions.length === 0 || totals.faturamento === 0 ? (
          <div className="pos-empty">{t('pos.dash.idleEmpty')}</div>
        ) : (
          suggestions.map(s => (
            <div key={s.hora} className="pos-row">
              <div style={{ fontSize: 18, fontWeight: 800, minWidth: 92 }}>{s.range}</div>
              <div className="pos-row-main">
                <div className="pos-row-title">{t(IDLE_LABEL[s.acao] || IDLE_LABEL.happy_hour)}</div>
                <div className="pos-row-sub">
                  {t('pos.dash.idleRow', {
                    current: fmtYen(s.faturamento),
                    gap: fmtYen(s.deficit),
                  })}
                </div>
              </div>
              <Pill tone={s.fill < 0.35 ? 'red' : s.fill < 0.6 ? 'amber' : 'blue'}>
                {Math.round(s.fill * 100)}%
              </Pill>
            </div>
          ))
        )}
      </Card>

      <div className="pos-grid-2">
        <Card title={t('pos.dash.stockTitle')} sub={t('pos.dash.stockSub')}>
          <StatGrid min={110}>
            <StatTile label={t('pos.stock.critical')} value={stock.critical} color="var(--red)" />
            <StatTile label={t('pos.stock.low')} value={stock.low} color="var(--amber)" />
            <StatTile label={t('pos.stock.ok')} value={stock.ok} color="var(--green)" />
          </StatGrid>
          <button type="button" className="btn-primary" style={{ width: '100%', padding: 11, borderRadius: 11 }} onClick={() => onNav('estoque')}>
            {t('pos.dash.openStock')}
          </button>
        </Card>

        <Card title={t('pos.dash.drinkBackTitle')} sub={t('pos.dash.drinkBackCardSub')}>
          {(agentTotals || []).filter(a => a.base > 0).slice(0, 4).map(a => (
            <div key={a.id} className="pos-row">
              <div className="pos-row-main">
                <div className="pos-row-title">{a.nome}</div>
                <div className="pos-row-sub">
                  {a.regiao || t('pos.drinkBack.noRegion')} · {t('pos.drinkBack.salesCount', { count: a.vendas })}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800 }}>{fmtYen(a.base)}</div>
                <div style={{ fontSize: 11, color: 'var(--gold)' }}>{fmtYen(a.comissao)}</div>
              </div>
            </div>
          ))}
          {(!agentTotals || agentTotals.every(a => a.base === 0)) && (
            <div className="pos-empty">{t('pos.dash.drinkBackEmpty')}</div>
          )}
          <button type="button" className="pos-btn-sm" onClick={() => onNav('drinkback')} style={{ width: '100%', marginTop: 4, padding: 10 }}>
            {t('pos.dash.openDrinkBack')}
          </button>
        </Card>
      </div>
    </div>
  )
}
